import { createClient } from "@/lib/supabase/server";
import type { EsitoRisposta, NominativiStrutturati } from "@/types";
import { DOMANDA_NOMINATIVI, SEZIONE_NOMINATIVI } from "@/types";
import { normalizzaNominativi } from "@/lib/nominativi";

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
 * Salva (upsert) una risposta di formazione per-nominativo (SEZ-03, Sprint 12).
 * Il `domandaId` è composito (`<D-03-00x>::<nominativoId>`); la data di verifica
 * è opzionale e vive in `campo_extra` (non concorre alla completezza).
 */
export async function salvaRispostaFormazione(input: {
  visitaId: string;
  domandaId: string;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string | null;
  osservazioni: string | null;
  dataVerifica: string | null;
}): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("risposte").upsert(
    {
      visita_id: input.visitaId,
      domanda_id: input.domandaId,
      sezione_id: "SEZ-03",
      valore: input.valore,
      azione_correttiva: input.azioneCorrettiva,
      osservazioni: input.osservazioni,
      campo_extra: input.dataVerifica ? { data_verifica: input.dataVerifica } : {},
      aggiornata_il: new Date().toISOString(),
    },
    { onConflict: "visita_id,domanda_id" }
  );

  if (error) {
    throw new Error(`Errore salvataggio formazione: ${error.message}`);
  }
}

/** Elimina una risposta (per id composito), es. formazione di un nominativo rimosso. */
export async function eliminaRisposta(visitaId: string, domandaId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("risposte")
    .delete()
    .eq("visita_id", visitaId)
    .eq("domanda_id", domandaId);
  if (error) {
    throw new Error(`Errore eliminazione risposta: ${error.message}`);
  }
}

/**
 * Salva i nominativi delle figure di sicurezza (SEZ-01) come riga sintetica
 * in `risposte`, con i dati in `campo_extra` (formato strutturato {id,nome}).
 */
export async function salvaNominativi(
  visitaId: string,
  nominativi: NominativiStrutturati
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

/**
 * Estrae e NORMALIZZA i nominativi dalla riga sintetica SEZ-01 (Sprint 12):
 * ritorna sempre la forma canonica {id,nome} per figura, accettando anche il
 * formato legacy a stringhe.
 */
export function estraiNominativi(risposte: RispostaSalvata[]): NominativiStrutturati {
  const riga = risposte.find((r) => r.domanda_id === DOMANDA_NOMINATIVI);
  return normalizzaNominativi(riga?.campo_extra ?? null);
}
