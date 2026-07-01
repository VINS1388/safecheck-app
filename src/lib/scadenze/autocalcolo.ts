// Helper client-safe per il calcolo automatico dell'esito da scadenza (Sprint 12.4).
// Unisce `valutaConformitaDaScadenza` (esito) e `calcolaScadenza` (data) e
// costruisce l'etichetta read-only mostrata al tecnico per trasparenza.
// Consumato da UI checklist (ChecklistClient) e formazione per-nominativo
// (FormazioneNominativi): un solo punto, nessuna duplicazione della logica.

import {
  calcolaScadenza,
  valutaConformitaDaScadenza,
  type EsitoConformita,
} from "@/lib/scadenze/calcola";
import { formatDateShort } from "@/lib/utils";

export interface EsitoAuto {
  esito: EsitoConformita;
  scadenza: string; // ISO yyyy-mm-dd
  etichetta: string; // testo trasparenza ("Calcolato: NC — scaduto il gg/mm/aaaa")
}

/**
 * Esito + etichetta calcolati dalla data attestato/verifica. Ritorna null se la
 * data non è valorizzata o la periodicità manca (nessun calcolo possibile).
 * La data di riferimento è SEMPRE `dataSopralluogo`, mai la data di sistema.
 */
export function calcolaEsitoAuto(
  dataAttestato: string | null | undefined,
  periodicitaMesi: number | null | undefined,
  dataSopralluogo: string,
  sogliaPcGiorni = 60
): EsitoAuto | null {
  const esito = valutaConformitaDaScadenza(
    dataAttestato,
    periodicitaMesi,
    dataSopralluogo,
    sogliaPcGiorni
  );
  const scadenza = calcolaScadenza(dataAttestato, periodicitaMesi);
  if (!esito || !scadenza) return null;
  const d = formatDateShort(scadenza);
  const etichetta =
    esito === "NC"
      ? `Calcolato: NC — attestato scaduto il ${d}`
      : esito === "PC"
        ? `Calcolato: PC — in scadenza il ${d}`
        : `Calcolato: C — valido fino al ${d}`;
  return { esito, scadenza, etichetta };
}

/**
 * Etichetta da mostrare sotto i bottoni esito per una domanda a calcolo
 * automatico, dato l'esito manuale corrente e la data. NA/NV impostati a mano
 * hanno la loro nota; senza data si invita a inserirla.
 */
export function etichettaAuto(
  esitoCorrente: string | null | undefined,
  dataAttestato: string | null | undefined,
  periodicitaMesi: number | null | undefined,
  dataSopralluogo: string,
  sogliaPcGiorni = 60
): string {
  if (esitoCorrente === "NA" || esitoCorrente === "NV") {
    return "Esito NA/NV impostato manualmente (non calcolato).";
  }
  const auto = dataAttestato
    ? calcolaEsitoAuto(dataAttestato, periodicitaMesi, dataSopralluogo, sogliaPcGiorni)
    : null;
  return (
    auto?.etichetta ??
    "Inserisci la data attestato/verifica per calcolare automaticamente C/PC/NC (oppure scegli NA/NV)."
  );
}
