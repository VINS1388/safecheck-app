"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  salvaModificheSlot,
  ripristinaTecnicoDefault,
} from "@/lib/db/queries/pianificazione";

export type SetDataResult = { ok: true } | { ok: false; error: string };
export type GeneraCicloResult = { ok: true; nuovi: number } | { ok: false; error: string };

/**
 * Salva le modifiche inline di uno slot (data e/o tecnico). Solo i campi
 * modificati vengono passati: `dataPianificata`/`tecnico` sono opzionali e
 * `undefined` significa "non toccato". L'assegnazione del tecnico imposta
 * `tecnico_personalizzato = true` (gestito nel data layer).
 */
export async function salvaSlotAction(
  slotId: string,
  input: { dataPianificata?: string; tecnico?: { id: string | null } }
): Promise<SetDataResult> {
  const { user } = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  try {
    await salvaModificheSlot(slotId, input);
    revalidatePath("/pianificazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore durante il salvataggio." };
  }
}

/** Ripristina il tecnico dello slot al default del piano (flag → false). */
export async function ripristinaDefaultSlotAction(slotId: string): Promise<SetDataResult> {
  const { user } = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  try {
    await ripristinaTecnicoDefault(slotId);
    revalidatePath("/pianificazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore durante il ripristino." };
  }
}

/** Genera il ciclo successivo di un piano (azione manuale del reparto pianificazione). */
export async function generaProssimoCicloAction(pianoId: string): Promise<GeneraCicloResult> {
  const { user } = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("genera_prossimo_ciclo", { p_piano_id: pianoId });
    if (error) return { ok: false, error: `Generazione ciclo fallita: ${error.message}` };
    revalidatePath("/pianificazione");
    return { ok: true, nuovi: (data as number) ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore durante la generazione del ciclo." };
  }
}
