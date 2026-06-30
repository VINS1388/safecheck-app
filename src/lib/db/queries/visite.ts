import { createClient } from "@/lib/supabase/server";
import type { TemplateSnapshot } from "@/types";
import type { Tables } from "@/types/database.types";

export type StatoVisita = Tables<"visite">["stato"];
export type StatoVerbale = Tables<"visite">["stato_verbale"];

/** Visita con i dati di cliente e sede risolti, per le viste di dettaglio. */
export interface VisitaDettaglio {
  id: string;
  cliente_id: string;
  sede_id: string;
  specialist_id: string;
  stato: StatoVisita;
  stato_verbale: StatoVerbale;
  data_visita: string;
  ora_inizio: string | null;
  referente_cliente: string | null;
  qualifica_tecnico: string | null;
  note_preliminari: string | null;
  numero_verbale: string | null;
  note_conclusive: string | null;
  derivato_da: string | null;
  sostituisce: string | null;
  sostituito_da: string | null;
  template_snapshot: TemplateSnapshot;
  cliente_nome: string;
  sede_nome: string;
  sede_indirizzo: string;
  sede_citta: string;
  specialist_nome: string;
}

/** Dati raccolti nella schermata "Avvia sopralluogo". */
export interface DatiAvvio {
  data_visita: string;
  ora_inizio: string | null;
  referente_cliente: string;
  qualifica_tecnico: string | null;
  note_preliminari: string | null;
}

/** Riga sintetica per gli elenchi (lista visite, visite per cliente). */
export interface VisitaRiepilogo {
  id: string;
  stato: StatoVisita;
  stato_verbale: StatoVerbale;
  data_visita: string;
  numero_verbale: string | null;
  sede_id: string;
  cliente_nome: string;
  sede_nome: string;
}

interface VisitaConRelazioni {
  id: string;
  cliente_id: string;
  sede_id: string;
  specialist_id: string;
  stato: StatoVisita;
  stato_verbale: StatoVerbale;
  data_visita: string;
  ora_inizio: string | null;
  referente_cliente: string | null;
  qualifica_tecnico: string | null;
  note_preliminari: string | null;
  numero_verbale: string | null;
  note_conclusive: string | null;
  derivato_da: string | null;
  sostituisce: string | null;
  sostituito_da: string | null;
  template_snapshot: TemplateSnapshot;
  clienti: { ragione_sociale: string } | null;
  sedi: { nome: string; indirizzo: string; citta: string } | null;
  utenti: { nome_completo: string } | null;
}

const SELECT_DETTAGLIO = `
  id, cliente_id, sede_id, specialist_id, stato, stato_verbale, data_visita, ora_inizio,
  referente_cliente, qualifica_tecnico, note_preliminari, numero_verbale,
  note_conclusive, derivato_da, sostituisce, sostituito_da, template_snapshot,
  clienti ( ragione_sociale ),
  sedi ( nome, indirizzo, citta ),
  utenti ( nome_completo )
`;

// Variante senza le colonne della migration 006 (qualifica_tecnico,
// note_preliminari): usata come fallback finché la 006 non è applicata.
const SELECT_DETTAGLIO_SENZA_006 = `
  id, cliente_id, sede_id, specialist_id, stato, stato_verbale, data_visita, ora_inizio,
  referente_cliente, numero_verbale,
  note_conclusive, derivato_da, sostituisce, sostituito_da, template_snapshot,
  clienti ( ragione_sociale ),
  sedi ( nome, indirizzo, citta ),
  utenti ( nome_completo )
`;

/**
 * Crea una nuova visita in stato "bozza" per la sede indicata.
 * Risolve il template master attivo e ne salva lo snapshot immutabile
 * (regola architetturale: ogni verbale ha lo snapshot del template).
 * Ritorna l'id della visita creata.
 */
export async function creaVisita(input: {
  clienteId: string;
  sedeId: string;
  specialistId: string;
}): Promise<string> {
  const supabase = await createClient();

  // Template master attivo (versione più recente).
  const { data: master, error: errMaster } = await supabase
    .from("template_master")
    .select("id, struttura_json")
    .eq("attivo", true)
    .order("versione", { ascending: false })
    .limit(1)
    .single();

  if (errMaster || !master) {
    throw new Error(
      `Impossibile risolvere il template master attivo: ${errMaster?.message ?? "nessun template"}`
    );
  }

  const oggi = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabase
    .from("visite")
    .insert({
      cliente_id: input.clienteId,
      sede_id: input.sedeId,
      specialist_id: input.specialistId,
      data_visita: oggi,
      stato: "bozza",
      template_master_id: master.id,
      template_snapshot: master.struttura_json,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Errore creazione visita: ${error?.message ?? "sconosciuto"}`);
  }

  return data.id;
}

/** Recupera una visita con cliente e sede risolti. Null se inesistente o non accessibile. */
export async function getVisitaById(id: string): Promise<VisitaDettaglio | null> {
  const supabase = await createClient();

  let { data, error } = await supabase
    .from("visite")
    .select(SELECT_DETTAGLIO)
    .eq("id", id)
    .single();

  // Fallback se la migration 006 non è ancora applicata (colonne assenti).
  if (error) {
    ({ data, error } = await supabase
      .from("visite")
      .select(SELECT_DETTAGLIO_SENZA_006)
      .eq("id", id)
      .single());
  }

  if (error || !data) return null;

  const v = data as unknown as VisitaConRelazioni;

  return {
    id: v.id,
    cliente_id: v.cliente_id,
    sede_id: v.sede_id,
    specialist_id: v.specialist_id,
    stato: v.stato,
    stato_verbale: v.stato_verbale ?? null,
    data_visita: v.data_visita,
    ora_inizio: v.ora_inizio,
    referente_cliente: v.referente_cliente,
    qualifica_tecnico: v.qualifica_tecnico,
    note_preliminari: v.note_preliminari,
    numero_verbale: v.numero_verbale,
    note_conclusive: v.note_conclusive,
    derivato_da: v.derivato_da ?? null,
    sostituisce: v.sostituisce ?? null,
    sostituito_da: v.sostituito_da ?? null,
    template_snapshot: v.template_snapshot,
    cliente_nome: v.clienti?.ragione_sociale ?? "—",
    sede_nome: v.sedi?.nome ?? "—",
    sede_indirizzo: v.sedi?.indirizzo ?? "",
    sede_citta: v.sedi?.citta ?? "",
    specialist_nome: v.utenti?.nome_completo ?? "—",
  };
}

/** Salva i dati della schermata "Avvia sopralluogo" sulla visita. */
export async function aggiornaDatiAvvio(
  visitaId: string,
  dati: DatiAvvio
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("visite")
    .update({
      data_visita: dati.data_visita,
      ora_inizio: dati.ora_inizio,
      referente_cliente: dati.referente_cliente,
      qualifica_tecnico: dati.qualifica_tecnico,
      note_preliminari: dati.note_preliminari,
    })
    .eq("id", visitaId);

  if (!error) return;

  // Fallback se la migration 006 non è ancora applicata: salva solo i campi
  // su colonne preesistenti (qualifica/note_preliminari richiedono la 006).
  const { error: errBase } = await supabase
    .from("visite")
    .update({
      data_visita: dati.data_visita,
      ora_inizio: dati.ora_inizio,
      referente_cliente: dati.referente_cliente,
    })
    .eq("id", visitaId);

  if (errBase) {
    throw new Error(`Errore salvataggio dati avvio: ${errBase.message}`);
  }
}

/** Elenco visite di un cliente, ordinate per data decrescente. */
export async function getVisiteByCliente(clienteId: string): Promise<VisitaRiepilogo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("visite")
    .select(`id, stato, stato_verbale, data_visita, numero_verbale, sede_id, clienti ( ragione_sociale ), sedi ( nome )`)
    .eq("cliente_id", clienteId)
    .order("data_visita", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as VisitaConRelazioni[]).map(mapRiepilogo);
}

/**
 * Elenco di tutte le visite accessibili all'utente loggato.
 * La RLS limita già le righe a `specialist_id = auth.uid()` (o admin).
 */
export async function getVisiteUtente(): Promise<VisitaRiepilogo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("visite")
    .select(`id, stato, stato_verbale, data_visita, numero_verbale, sede_id, clienti ( ragione_sociale ), sedi ( nome )`)
    .order("data_visita", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as VisitaConRelazioni[]).map(mapRiepilogo);
}

function mapRiepilogo(v: VisitaConRelazioni): VisitaRiepilogo {
  return {
    id: v.id,
    stato: v.stato,
    stato_verbale: v.stato_verbale ?? null,
    data_visita: v.data_visita,
    numero_verbale: v.numero_verbale,
    sede_id: v.sede_id,
    cliente_nome: v.clienti?.ragione_sociale ?? "—",
    sede_nome: v.sedi?.nome ?? "—",
  };
}

/** Riferimento minimo a un verbale per la genealogia (numero + stato). */
export interface VerbaleRef {
  id: string;
  numero_verbale: string | null;
  stato_verbale: StatoVerbale;
}

/** Risolve numero/stato verbale per un insieme di id (per i link di genealogia). */
export async function getVerbaliRefByIds(
  ids: string[]
): Promise<Map<string, VerbaleRef>> {
  const puliti = ids.filter((x): x is string => Boolean(x));
  if (puliti.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visite")
    .select("id, numero_verbale, stato_verbale")
    .in("id", puliti);

  const map = new Map<string, VerbaleRef>();
  if (error || !data) return map;
  for (const r of data as VerbaleRef[]) map.set(r.id, r);
  return map;
}
