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

/** Campi intestazione HACCP salvati su visite.intestazione_extra (Sprint HACCP 2). */
export interface IntestazioneHaccpInput {
  ora_fine?: string | null;
  funzione_referente?: string | null;
  attivita_in_corso?: string | null;
  aree_visitate?: string | null;
  aree_non_visitate_motivo?: string | null;
  flag_rilievi_fotografici?: boolean;
  presa_visione_referente_testuale?: string | null;
}

/** Salva l'intestazione HACCP (JSONB) sulla visita. Sostituisce l'intero oggetto. */
export async function salvaIntestazioneHaccpAction(
  visitaId: string,
  input: IntestazioneHaccpInput
): Promise<SalvaNoteResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("visite")
    .update({ intestazione_extra: input })
    .eq("id", visitaId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
