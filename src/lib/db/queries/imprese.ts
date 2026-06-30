import { createClient } from "@/lib/supabase/server";
import type {
  EsitoRisposta,
  ImpresaAppalto,
  RispostaImpresaAppalto,
  TipoImpresa,
} from "@/types";

// Tabelle SEZ-08 multi-impresa (Sprint 9.1). Fonte di verità: Supabase.
// RLS garantisce l'ownership via visita.specialist_id; qui non si replicano
// controlli di permesso, solo lettura/scrittura.

interface ImpresaRow {
  id: string;
  visita_id: string;
  ragione_sociale: string;
  tipo_impresa: string;
  ordine: number;
}

interface RispostaImpresaRow {
  id: string;
  impresa_id: string;
  domanda_id: string;
  esito: EsitoRisposta;
  osservazione: string | null;
  azione_correttiva: string | null;
}

function mapImpresa(r: ImpresaRow): ImpresaAppalto {
  return {
    id: r.id,
    visitaId: r.visita_id,
    ragioneSociale: r.ragione_sociale,
    tipoImpresa: r.tipo_impresa as TipoImpresa,
    ordine: r.ordine,
  };
}

function mapRisposta(r: RispostaImpresaRow): RispostaImpresaAppalto {
  return {
    id: r.id,
    impresaId: r.impresa_id,
    domandaId: r.domanda_id,
    esito: r.esito,
    osservazione: r.osservazione ?? undefined,
    azioneCorrettiva: r.azione_correttiva ?? undefined,
  };
}

/** Imprese di una visita, ordinate per `ordine` poi data di creazione. */
export async function getImpreseByVisita(visitaId: string): Promise<ImpresaAppalto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imprese_appalto")
    .select("id, visita_id, ragione_sociale, tipo_impresa, ordine")
    .eq("visita_id", visitaId)
    .order("ordine", { ascending: true })
    .order("creato_il", { ascending: true });

  if (error || !data) return [];
  return (data as ImpresaRow[]).map(mapImpresa);
}

/** Tutte le risposte-impresa di una visita (join via imprese_appalto). */
export async function getRisposteImpreseByVisita(
  visitaId: string
): Promise<RispostaImpresaAppalto[]> {
  const imprese = await getImpreseByVisita(visitaId);
  if (imprese.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("risposte_imprese_appalto")
    .select("id, impresa_id, domanda_id, esito, osservazione, azione_correttiva")
    .in(
      "impresa_id",
      imprese.map((i) => i.id)
    );

  if (error || !data) return [];
  return (data as RispostaImpresaRow[]).map(mapRisposta);
}

/** Crea una nuova impresa per la visita; `ordine` = max corrente + 1. */
export async function creaImpresa(input: {
  visitaId: string;
  ragioneSociale: string;
  tipoImpresa: TipoImpresa;
}): Promise<ImpresaAppalto> {
  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("imprese_appalto")
    .select("ordine")
    .eq("visita_id", input.visitaId)
    .order("ordine", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ordine = ((maxRow as { ordine: number } | null)?.ordine ?? -1) + 1;

  const { data, error } = await supabase
    .from("imprese_appalto")
    .insert({
      visita_id: input.visitaId,
      ragione_sociale: input.ragioneSociale,
      tipo_impresa: input.tipoImpresa,
      ordine,
    })
    .select("id, visita_id, ragione_sociale, tipo_impresa, ordine")
    .single();

  if (error || !data) {
    throw new Error(`Errore creazione impresa: ${error?.message ?? "sconosciuto"}`);
  }
  return mapImpresa(data as ImpresaRow);
}

/** Elimina un'impresa (cascata su risposte_imprese_appalto via FK). */
export async function eliminaImpresa(impresaId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("imprese_appalto").delete().eq("id", impresaId);
  if (error) {
    throw new Error(`Errore eliminazione impresa: ${error.message}`);
  }
}

/** Upsert di una risposta-impresa per la coppia (impresa, domanda). */
export async function salvaRispostaImpresa(input: {
  impresaId: string;
  domandaId: string;
  esito: EsitoRisposta;
  osservazione: string | null;
  azioneCorrettiva: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("risposte_imprese_appalto").upsert(
    {
      impresa_id: input.impresaId,
      domanda_id: input.domandaId,
      esito: input.esito,
      osservazione: input.osservazione,
      azione_correttiva: input.azioneCorrettiva,
      aggiornato_il: new Date().toISOString(),
    },
    { onConflict: "impresa_id,domanda_id" }
  );

  if (error) {
    throw new Error(`Errore salvataggio risposta impresa: ${error.message}`);
  }
}
