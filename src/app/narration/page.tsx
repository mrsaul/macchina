import { redirect } from "next/navigation";
import { DEFAULT_MACHINE_ID } from "@/lib/machines";

// Kept for links shared before machines had their own URLs.
export default function NarrationRedirect() {
  redirect(`/m/${DEFAULT_MACHINE_ID}/narration`);
}
