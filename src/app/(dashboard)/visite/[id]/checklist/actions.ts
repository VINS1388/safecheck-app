"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { salvaRisposta } from "@/lib/db/queries/risposte";
import type { EsitoRisposta } from "@/types";

export interface SalvaRispostaActionInput {
  visitaId: string;
  domandaId: string;
  sezioneId: string;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string | null;
}

export type SalvaRispostaResult = { ok: true } | { ok: false; error: string };

/**
 * Autosave di una singola risposta. La RLS garantisce che solo il proprietario
 * (o admin) della visita possa scrivere; qui verifichiamo solo l'autenticazione.
 */
export async function salvaRispostaAction(
  input: SalvaRispostaActionInput
): Promise<SalvaRispostaResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }

  try {
    await salvaRisposta({
      visitaId: input.visitaId,
      domandaId: input.domandaId,
      sezioneId: input.sezioneId,
      valore: input.valore,
      azioneCorrettiva: input.azioneCorrettiva,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}
