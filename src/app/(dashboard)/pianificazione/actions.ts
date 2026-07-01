"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateDataPianificata } from "@/lib/db/queries/pianificazione";

export type SetDataResult = { ok: true } | { ok: false; error: string };
export type GeneraCicloResult = { ok: true; nuovi: number } | { ok: false; error: string };

/** Imposta la data pianificata di uno slot (→ 'pianificata'). */
export async function setDataPianificataAction(
  slotId: string,
  dataPianificata: string
): Promise<SetDataResult> {
  const { user } = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  if (!dataPianificata) return { ok: false, error: "Seleziona una data." };
  try {
    await updateDataPianificata(slotId, dataPianificata);
    revalidatePath("/pianificazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore durante il salvataggio." };
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
