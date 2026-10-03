"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/auth/AuthProvider";
import { DEFAULT_ROLE, type MemberRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

type RoleState = { role: MemberRole; loading: boolean };

/**
 * Effective role of the current user on a machine, read from `memberships`.
 * Anonymous visitors, users without a membership, and failed lookups all get
 * "reader": the least privileged role. This is for display only — write
 * permissions are enforced by RLS in the database.
 */
export function useRole(machineId: string): RoleState {
  const user = useUser();
  const userId = user?.id ?? null;
  // Results are keyed by user + machine so a stale answer is never shown
  // after signing in/out or switching machine.
  const key = userId ? `${userId}:${machineId}` : null;
  const [result, setResult] = useState<{ key: string; role: MemberRole } | null>(null);

  useEffect(() => {
    if (!key || !userId) return;
    let cancelled = false;

    createClient()
      .from("memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("machine_id", machineId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled) setResult({ key, role: !error && data ? data.role : DEFAULT_ROLE });
      });

    return () => {
      cancelled = true;
    };
  }, [key, userId, machineId]);

  if (!key) return { role: DEFAULT_ROLE, loading: false };
  if (result?.key !== key) return { role: DEFAULT_ROLE, loading: true };
  return { role: result.role, loading: false };
}
