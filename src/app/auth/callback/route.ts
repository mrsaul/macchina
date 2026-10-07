import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// Landing point of the magic link. Supports both link formats:
// - `?code=` (PKCE, Supabase's default email template) — must be opened in the
//   same browser that requested the link;
// - `?token_hash=&type=` (custom template) — works from any browser.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, origin));

  // Supabase redirects here with error params when the link is expired or reused.
  if (searchParams.get("error_code") === "otp_expired") return fail("expired");
  if (searchParams.get("error")) return fail("link");

  const supabase = await createClient();

  // Signed in: every account must choose a username before contributing.
  const done = async () => {
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (userId) {
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
      if (!profile?.username) return NextResponse.redirect(new URL(`/compte?next=${encodeURIComponent(next)}`, origin));
    }
    return NextResponse.redirect(new URL(next, origin));
  };

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return done();
    return fail(error.code === "pkce_code_verifier_not_found" ? "browser" : "link");
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return done();
    return fail(error.code === "otp_expired" ? "expired" : "link");
  }

  return fail("link");
}
