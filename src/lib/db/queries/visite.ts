import { createClient } from "@/lib/supabase/server";
import type { TemplateSnapshot } from "@/types";
import type { Tables } from "@/types/database.types";

export type StatoVisita = Tables<"visite">["stato"];

/** Visita con i dati di cliente e sede risolti, per le viste di dettaglio. */
export interface VisitaDettaglio {
  id: string;
  cliente_id: string;
  sede_id: string;
  specialist_id: string;
  stato: StatoVisita;
  data_visita: string;
  numero_verbale: string | null;
  note_conclusive: string | null;
  template_snapshot: TemplateSnapshot;
  cliente_nome: string;
  sede_nome: string;
  sede_indirizzo: string;
  sede_citta: string;
  specialist_nome: string;
}

/** Riga sintetica per gli elenchi (lista visite, visite per cliente). */
export interface VisitaRiepilogo {
  id: string;
  stato: StatoVisita;
  data_visita: string;
  numero_verbale: string | null;
  cliente_nome: string;
  sede_nome: string;
}

interface VisitaConRelazioni {
  id: string;
  cliente_id: string;
  sede_id: string;
  specialist_id: string;
  stato: StatoVisita;
  data_visita: string;
  numero_verbale: string | null;
  note_conclusive: string | null;
  template_snapshot: TemplateSnapshot;
  clienti: { ragione_sociale: string } | null;
  sedi: { nome: string; indirizzo: string; citta: string } | null;
  utenti: { nome_completo: string } | null;
}

const SELECT_DETTAGLIO = `
  id, cliente_id, sede_id, specialist_id, stato, data_visita, numero_verbale,
  note_conclusive, template_snapshot,
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

  const { data, error } = await supabase
    .from("visite")
    .select(SELECT_DETTAGLIO)
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const v = data as unknown as VisitaConRelazioni;

  return {
    id: v.id,
    cliente_id: v.cliente_id,
    sede_id: v.sede_id,
    specialist_id: v.specialist_id,
    stato: v.stato,
    data_visita: v.data_visita,
    numero_verbale: v.numero_verbale,
    note_conclusive: v.note_conclusive,
    template_snapshot: v.template_snapshot,
    cliente_nome: v.clienti?.ragione_sociale ?? "—",
    sede_nome: v.sedi?.nome ?? "—",
    sede_indirizzo: v.sedi?.indirizzo ?? "",
    sede_citta: v.sedi?.citta ?? "",
    specialist_nome: v.utenti?.nome_completo ?? "—",
  };
}

/** Elenco visite di un cliente, ordinate per data decrescente. */
export async function getVisiteByCliente(clienteId: string): Promise<VisitaRiepilogo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("visite")
    .select(`id, stato, data_visita, numero_verbale, clienti ( ragione_sociale ), sedi ( nome )`)
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
    .select(`id, stato, data_visita, numero_verbale, clienti ( ragione_sociale ), sedi ( nome )`)
    .order("data_visita", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as VisitaConRelazioni[]).map(mapRiepilogo);
}

function mapRiepilogo(v: VisitaConRelazioni): VisitaRiepilogo {
  return {
    id: v.id,
    stato: v.stato,
    data_visita: v.data_visita,
    numero_verbale: v.numero_verbale,
    cliente_nome: v.clienti?.ragione_sociale ?? "—",
    sede_nome: v.sedi?.nome ?? "—",
  };
}
