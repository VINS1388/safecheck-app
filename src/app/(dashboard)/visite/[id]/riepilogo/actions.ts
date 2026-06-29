"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type SalvaNoteResult = { ok: true } | { ok: false; error: string };

/** Salva le note finali della visita su `visite.note_conclusive`. */
export async function salvaNoteFinaliAction(
  visitaId: string,
  note: string
): Promise<SalvaNoteResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("visite")
    .update({ note_conclusive: note.trim() ? note : null })
    .eq("id", visitaId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
