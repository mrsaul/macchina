"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/auth/AuthProvider";
import { Chip, chipClassName, Tag, ThemeToggle } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Site-wide: brand, sign-in and theme. The per-machine role lives in the
// machine header (MachineHeader), since roles are granted per machine.
export function SiteHeader() {
  const user = useUser();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.refresh();
  }

  return (
    <header className="border-b-rule border-line">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <Link href="/" aria-label="Accueil">
          <Tag>Roast Copilot</Tag>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <>
              <span className="hidden max-w-[16ch] truncate text-xs text-muted sm:inline" title={user.email ?? ""}>
                {user.email}
              </span>
              <Chip onClick={signOut}>Déconnexion</Chip>
            </>
          ) : (
            isSupabaseConfigured && (
              <Link href="/login" className={chipClassName()}>
                Connexion
              </Link>
            )
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
