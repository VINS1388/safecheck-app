import { createClient } from "@/lib/supabase/server";
import type { EsitoRisposta } from "@/types";

/** Stato di una singola risposta come salvato/letto dal DB. */
export interface RispostaSalvata {
  domanda_id: string;
  sezione_id: string;
  valore: EsitoRisposta | null;
  azione_correttiva: string | null;
}

export interface SalvaRispostaInput {
  visitaId: string;
  domandaId: string;
  sezioneId: string;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string | null;
}

/**
 * Salva (upsert) una risposta per la coppia (visita, domanda).
 * Fonte di verità: Supabase. Chiamata dall'autosave della checklist.
 */
export async function salvaRisposta(input: SalvaRispostaInput): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("risposte")
    .upsert(
      {
        visita_id: input.visitaId,
        domanda_id: input.domandaId,
        sezione_id: input.sezioneId,
        valore: input.valore,
        azione_correttiva: input.azioneCorrettiva,
        aggiornata_il: new Date().toISOString(),
      },
      { onConflict: "visita_id,domanda_id" }
    );

  if (error) {
    throw new Error(`Errore salvataggio risposta: ${error.message}`);
  }
}

/** Tutte le risposte già salvate per una visita. */
export async function getRisposteByVisita(visitaId: string): Promise<RispostaSalvata[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("risposte")
    .select("domanda_id, sezione_id, valore, azione_correttiva")
    .eq("visita_id", visitaId);

  if (error || !data) return [];

  return data as RispostaSalvata[];
}
