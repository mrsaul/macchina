import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import { AuthProvider, type AuthUser } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Roast Copilot",
  description: "Assistant open source pour comprendre et piloter des torréfacteurs.",
};

// Applies a forced theme before first paint to avoid a light/dark flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

async function getInitialUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, email: data.user.email ?? null, username: profile?.username ?? null };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialUser = await getInitialUser();

  return (
    <html lang="fr" className={`${spaceMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider initialUser={initialUser}>
          <SiteHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
