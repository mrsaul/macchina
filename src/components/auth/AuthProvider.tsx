"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type AuthUser = { id: string; email: string | null };

const AuthContext = createContext<AuthUser | null>(null);

/**
 * Shares the signed-in user (or null for anonymous readers) with the client tree.
 * `initialUser` comes from the server so the first render is already correct.
 */
export function AuthProvider({ initialUser, children }: { initialUser: AuthUser | null; children: ReactNode }) {
  const [user, setUser] = useState(initialUser);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      // Token refreshes fire events too; keep the same object when nothing changed.
      setUser((prev) =>
        prev?.id === next?.id && prev?.email === (next?.email ?? null)
          ? prev
          : next && { id: next.id, email: next.email ?? null },
      );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

/** The signed-in user, or null when browsing anonymously. */
export function useUser() {
  return useContext(AuthContext);
}
