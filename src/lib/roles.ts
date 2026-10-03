import type { Database } from "@/lib/supabase/database.types";

export type MemberRole = Database["public"]["Enums"]["member_role"];

/** Everyone without a membership — including anonymous visitors — is a reader. */
export const DEFAULT_ROLE: MemberRole = "reader";

export const ROLE_LABELS: Record<MemberRole, string> = {
  reader: "Lecteur",
  contributor: "Contributeur",
  maintainer: "Mainteneur",
};
