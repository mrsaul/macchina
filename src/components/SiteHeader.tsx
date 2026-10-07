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
          <Link href="/machines/new" className={chipClassName()}>
            + Machine
          </Link>
          {user ? (
            <>
              {user.username ? (
                <Link
                  href="/compte"
                  className="hidden max-w-[16ch] truncate text-xs text-muted underline-offset-4 hover:underline sm:inline"
                  title={user.email ?? ""}
                >
                  {user.username}
                </Link>
              ) : (
                <Link href="/compte" className="bg-ink px-2 py-1 text-xs font-bold uppercase tracking-wider text-paper">
                  Choisir un nom
                </Link>
              )}
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
