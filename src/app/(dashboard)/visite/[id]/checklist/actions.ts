"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  salvaRisposta,
  salvaNominativi,
  salvaLavoratori,
  salvaRispostaFormazione,
  eliminaRisposta,
} from "@/lib/db/queries/risposte";
import {
  creaImpresa,
  eliminaImpresa,
  salvaRispostaImpresa,
} from "@/lib/db/queries/imprese";
import type {
  EsitoRisposta,
  ImpresaAppalto,
  Lavoratore,
  NominativiStrutturati,
  TipoImpresa,
} from "@/types";

export interface SalvaRispostaActionInput {
  visitaId: string;
  domandaId: string;
  sezioneId: string;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string | null;
  osservazioneEvidenza: string | null;
  osservazioni: string | null;
  dataVerifica?: string | null;
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
      osservazioneEvidenza: input.osservazioneEvidenza,
      osservazioni: input.osservazioni,
      dataVerifica: input.dataVerifica,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}

/** Autosave dei nominativi delle figure di sicurezza (SEZ-01), formato strutturato. */
export async function salvaNominativiAction(
  visitaId: string,
  nominativi: NominativiStrutturati
): Promise<SalvaRispostaResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }

  try {
    await salvaNominativi(visitaId, nominativi);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}

/** Autosave dell'elenco lavoratori (SEZ-01, Sprint 14). */
export async function salvaLavoratoriAction(
  visitaId: string,
  lavoratori: Lavoratore[]
): Promise<SalvaRispostaResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }
  try {
    await salvaLavoratori(visitaId, lavoratori);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}

/** Autosave di una risposta di formazione per-nominativo (SEZ-03, Sprint 12). */
export async function salvaRispostaFormazioneAction(input: {
  visitaId: string;
  domandaId: string;
  valore: EsitoRisposta | null;
  azioneCorrettiva: string | null;
  osservazioni: string | null;
  dataVerifica: string | null;
}): Promise<SalvaRispostaResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }
  try {
    await salvaRispostaFormazione(input);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}

/** Elimina la risposta di formazione di un nominativo rimosso (SEZ-03). */
export async function eliminaRispostaFormazioneAction(
  visitaId: string,
  domandaId: string
): Promise<SalvaRispostaResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }
  try {
    await eliminaRisposta(visitaId, domandaId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}

// ── SEZ-08 multi-impresa (Sprint 9.1) ─────────────────────────────────────
// Autosave/CRUD imprese. La RLS garantisce che solo il proprietario (o admin)
// della visita possa scrivere; qui verifichiamo solo l'autenticazione, come
// per l'autosave delle risposte standard.

export type CreaImpresaResult =
  | { ok: true; impresa: ImpresaAppalto }
  | { ok: false; error: string };

export async function creaImpresaAction(
  visitaId: string,
  ragioneSociale: string,
  tipoImpresa: TipoImpresa
): Promise<CreaImpresaResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }
  const nome = ragioneSociale.trim();
  if (!nome) {
    return { ok: false, error: "La ragione sociale è obbligatoria." };
  }
  try {
    const impresa = await creaImpresa({ visitaId, ragioneSociale: nome, tipoImpresa });
    return { ok: true, impresa };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}

export async function eliminaImpresaAction(
  impresaId: string
): Promise<SalvaRispostaResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }
  try {
    await eliminaImpresa(impresaId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}

export interface SalvaRispostaImpresaActionInput {
  impresaId: string;
  domandaId: string;
  esito: EsitoRisposta;
  osservazione: string | null;
  azioneCorrettiva: string | null;
}

export async function salvaRispostaImpresaAction(
  input: SalvaRispostaImpresaActionInput
): Promise<SalvaRispostaResult> {
  const { user } = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  }
  try {
    await salvaRispostaImpresa({
      impresaId: input.impresaId,
      domandaId: input.domandaId,
      esito: input.esito,
      osservazione: input.osservazione,
      azioneCorrettiva: input.azioneCorrettiva,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di rete durante il salvataggio.";
    return { ok: false, error: msg };
  }
}
