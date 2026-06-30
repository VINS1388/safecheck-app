import { createClient } from "@/lib/supabase/server";
import type { EsitoRisposta, Nominativi } from "@/types";
import { DOMANDA_NOMINATIVI, SEZIONE_NOMINATIVI } from "@/types";

/** Stato di una singola risposta come salvato/letto dal DB. */
export interface RispostaSalvata {
  domanda_id: string;
  sezione_id: string;
  valore: EsitoRisposta | null;
  azione_correttiva: string | null;
  osservazione_evidenza: string | null;
  osservazioni: string | null;
  campo_extra: unknown | null;
}

export interface SalvaRispostaInput {
  visitaId: string;
  domandaId: string;
  sezioneId: string;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string | null;
  osservazioneEvidenza?: string | null;
  osservazioni?: string | null;
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
        osservazione_evidenza: input.osservazioneEvidenza ?? null,
        osservazioni: input.osservazioni ?? null,
        aggiornata_il: new Date().toISOString(),
      },
      { onConflict: "visita_id,domanda_id" }
    );

  if (error) {
    throw new Error(`Errore salvataggio risposta: ${error.message}`);
  }
}

/**
 * Salva i nominativi delle figure di sicurezza (SEZ-01) come riga sintetica
 * in `risposte`, con i dati in `campo_extra`.
 */
export async function salvaNominativi(
  visitaId: string,
  nominativi: Nominativi
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("risposte").upsert(
    {
      visita_id: visitaId,
      domanda_id: DOMANDA_NOMINATIVI,
      sezione_id: SEZIONE_NOMINATIVI,
      valore: null,
      campo_extra: nominativi,
      aggiornata_il: new Date().toISOString(),
    },
    { onConflict: "visita_id,domanda_id" }
  );

  if (error) {
    throw new Error(`Errore salvataggio nominativi: ${error.message}`);
  }
}

/** Tutte le risposte già salvate per una visita (inclusa la riga nominativi). */
export async function getRisposteByVisita(visitaId: string): Promise<RispostaSalvata[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("risposte")
    .select(
      "domanda_id, sezione_id, valore, azione_correttiva, osservazione_evidenza, osservazioni, campo_extra"
    )
    .eq("visita_id", visitaId);

  if (error || !data) return [];

  return data as RispostaSalvata[];
}

/** Estrae i nominativi dalla riga sintetica SEZ-01, se presente. */
export function estraiNominativi(risposte: RispostaSalvata[]): Nominativi {
  const riga = risposte.find((r) => r.domanda_id === DOMANDA_NOMINATIVI);
  if (riga && riga.campo_extra && typeof riga.campo_extra === "object") {
    return riga.campo_extra as Nominativi;
  }
  return {};
}
