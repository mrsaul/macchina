import "server-only";
import { DEFAULT_ROLE, type MemberRole } from "@/lib/roles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side twin of useRole(): who is calling and what they may do on a
 * machine. Verifies the session (getClaims checks the JWT signature) and reads
 * the membership through RLS, so a user only ever sees their own role.
 */
export async function getMachineRole(machineId: string): Promise<{ userId: string | null; role: MemberRole }> {
  if (!isSupabaseConfigured) return { userId: null, role: DEFAULT_ROLE };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;
  if (!userId) return { userId: null, role: DEFAULT_ROLE };

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("machine_id", machineId)
    .maybeSingle();

  return { userId, role: membership?.role ?? DEFAULT_ROLE };
}
