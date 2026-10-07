"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type Contribution = Tables<"contributions">;

type State = {
  rows: Contribution[];
  /** user id → public display name, for "proposé par / validé par". */
  names: Record<string, string>;
  loading: boolean;
  error: string | null;
};

/**
 * All contributions of a machine the current user may see, kept live with
 * Supabase Realtime. RLS decides the scope: visitors get approved rows,
 * contributors also their own, maintainers everything on their machine.
 */
export function useContributions(machineId: string) {
  const user = useUser();
  const userId = user?.id ?? null;
  const [state, setState] = useState<State>({ rows: [], names: {}, loading: true, error: null });

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return setState({ rows: [], names: {}, loading: false, error: null });
    const supabase = createClient();

    const { data: rows, error } = await supabase
      .from("contributions")
      .select("*")
      .eq("machine_id", machineId)
      .order("created_at", { ascending: true });
    if (error) return setState((s) => ({ ...s, loading: false, error: "Impossible de charger les contributions." }));

    const ids = [...new Set(rows.flatMap((r) => [r.proposed_by, r.reviewed_by]).filter((id): id is string => !!id))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] };

    setState({
      rows,
      names: Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name])),
      loading: false,
      error: null,
    });
  }, [machineId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Reload on any change rather than patching rows from the payload: one
    // query keeps RLS, ordering and display names consistent.
    const scheduleLoad = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 150);
    };

    scheduleLoad(); // initial load, and again when the user signs in or out
    const channel = supabase
      .channel(`contributions:${machineId}:${userId ?? "anon"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contributions", filter: `machine_id=eq.${machineId}` },
        scheduleLoad,
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [machineId, userId, load]);

  return { ...state, reload: load };
}
