"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** username is null until the account has chosen one (required to contribute). */
export type AuthUser = { id: string; email: string | null; username: string | null };

type AuthValue = { user: AuthUser | null; setUsername: (username: string) => void };

const AuthContext = createContext<AuthValue>({ user: null, setUsername: () => {} });

async function fetchUsername(userId: string) {
  const { data } = await createClient().from("profiles").select("username").eq("id", userId).maybeSingle();
  return data?.username ?? null;
}

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
      setUser((prev) => {
        // Token refreshes fire events too; keep the same object when nothing changed.
        if (prev?.id === next?.id && prev?.email === (next?.email ?? null)) return prev;
        if (!next) return null;
        // A different account: its username is loaded just below.
        void fetchUsername(next.id).then((username) =>
          setUser((current) => (current?.id === next.id ? { ...current, username } : current)),
        );
        return { id: next.id, email: next.email ?? null, username: null };
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const setUsername = useCallback((username: string) => setUser((u) => (u ? { ...u, username } : u)), []);

  return <AuthContext.Provider value={{ user, setUsername }}>{children}</AuthContext.Provider>;
}

/** The signed-in user, or null when browsing anonymously. */
export function useUser() {
  return useContext(AuthContext).user;
}

/** For the account page: update the username everywhere after saving it. */
export function useSetUsername() {
  return useContext(AuthContext).setUsername;
}
