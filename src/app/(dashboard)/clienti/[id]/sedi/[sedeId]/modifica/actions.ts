"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManagePlanning } from "@/lib/auth/rbac";
import { salvaPiano, type EsitoSalvaPiano } from "@/lib/db/queries/pianificazione";

export type SalvaPianoResult =
  | { ok: true; esito: EsitoSalvaPiano }
  | { ok: false; error: string };

export interface SalvaPianoActionInput {
  sedeId: string;
  dataInizioCiclo: string;
  visiteAnno: number;
  tecnicoAssegnatoId: string | null;
}

/** Crea/aggiorna il piano visite di una sede (con ricalcolo slot non eseguiti). */
export async function salvaPianoAction(
  clienteId: string,
  input: SalvaPianoActionInput
): Promise<SalvaPianoResult> {
  const { user } = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  if (!(await canManagePlanning())) {
    return { ok: false, error: "Non hai i permessi per gestire il piano visite." };
  }

  if (!input.dataInizioCiclo) {
    return { ok: false, error: "La data di inizio ciclo è obbligatoria." };
  }
  if (!(input.visiteAnno >= 1 && input.visiteAnno <= 12)) {
    return { ok: false, error: "Numero di visite/anno non valido (1-12)." };
  }

  try {
    const { esito } = await salvaPiano(input);
    revalidatePath(`/clienti/${clienteId}/sedi/${input.sedeId}/modifica`);
    revalidatePath("/pianificazione");
    return { ok: true, esito };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore durante il salvataggio del piano." };
  }
}
