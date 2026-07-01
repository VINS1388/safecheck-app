import { createClient } from "@/lib/supabase/server";
import { calcolaScadenza } from "@/lib/scadenze/calcola";
import type {
  PianoVisite,
  StatoSlot,
  TecnicoOption,
  VisitaPianificata,
} from "@/types";

// Data layer pianificazione visite (Sprint 15). Fonte di verità: Supabase.
// RLS single-tenant (auth.uid() IS NOT NULL); qui nessun controllo permessi
// replicato oltre all'autenticazione già garantita dalle route/action.

function mapPiano(d: {
  id: string;
  sede_id: string;
  data_inizio_ciclo: string;
  visite_anno: number;
  tecnico_assegnato_id: string | null;
  ciclo_corrente: number;
}): PianoVisite {
  return {
    id: d.id,
    sedeId: d.sede_id,
    dataInizioCiclo: d.data_inizio_ciclo,
    visiteAnno: d.visite_anno,
    tecnicoAssegnatoId: d.tecnico_assegnato_id,
    cicloCorrente: d.ciclo_corrente,
  };
}

const PIANO_COLS =
  "id, sede_id, data_inizio_ciclo, visite_anno, tecnico_assegnato_id, ciclo_corrente";

/** Piano della sede (null se non configurato). */
export async function getPianoBySede(sedeId: string): Promise<PianoVisite | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("piani_visite")
    .select(PIANO_COLS)
    .eq("sede_id", sedeId)
    .maybeSingle();
  return data ? mapPiano(data) : null;
}

function mapSlot(d: {
  id: string;
  piano_id: string;
  sede_id: string;
  numero_visita: number;
  ciclo_numero: number;
  data_suggerita: string;
  data_pianificata: string | null;
  stato: string;
  visita_id: string | null;
}): VisitaPianificata {
  return {
    id: d.id,
    pianoId: d.piano_id,
    sedeId: d.sede_id,
    numeroVisita: d.numero_visita,
    cicloNumero: d.ciclo_numero,
    dataSuggerita: d.data_suggerita,
    dataPianificata: d.data_pianificata,
    stato: d.stato as StatoSlot,
    visitaId: d.visita_id,
  };
}

const SLOT_COLS =
  "id, piano_id, sede_id, numero_visita, ciclo_numero, data_suggerita, data_pianificata, stato, visita_id";

/** Slot di un ciclo specifico di un piano, ordinati per numero visita. */
export async function getSlotByPianoCiclo(
  pianoId: string,
  ciclo: number
): Promise<VisitaPianificata[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visite_pianificate")
    .select(SLOT_COLS)
    .eq("piano_id", pianoId)
    .eq("ciclo_numero", ciclo)
    .order("numero_visita", { ascending: true });
  return (data ?? []).map(mapSlot);
}

/** Tecnici assegnabili: utenti attivi (ruolo admin o specialist). */
export async function getTecnici(): Promise<TecnicoOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("utenti")
    .select("id, nome_completo, ruolo")
    .eq("attivo", true)
    .order("nome_completo", { ascending: true });
  return (data ?? []).map((u) => ({
    id: u.id,
    nomeCompleto: u.nome_completo,
    ruolo: u.ruolo,
  }));
}

/** Relazione Supabase embeddata: può arrivare come oggetto o array a 1 elemento. */
function first<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

/** Slot arricchito con cliente/sede/tecnico per la pagina Pianificazione. */
export interface SlotPianificazione extends VisitaPianificata {
  clienteId: string;
  clienteNome: string;
  sedeNome: string;
  tecnicoId: string | null;
}

interface SlotRow {
  id: string;
  piano_id: string;
  sede_id: string;
  numero_visita: number;
  ciclo_numero: number;
  data_suggerita: string;
  data_pianificata: string | null;
  stato: string;
  visita_id: string | null;
  sedi: { nome: string; cliente_id: string; clienti: { ragione_sociale: string } | { ragione_sociale: string }[] | null } | { nome: string; cliente_id: string; clienti: unknown }[] | null;
  piani_visite: { tecnico_assegnato_id: string | null } | { tecnico_assegnato_id: string | null }[] | null;
}

/**
 * Tutti gli slot pianificati, arricchiti con cliente/sede/tecnico, ordinati per
 * data effettiva (COALESCE(data_pianificata, data_suggerita)) crescente.
 */
export async function getPianificazione(): Promise<SlotPianificazione[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("visite_pianificate").select(
    `id, piano_id, sede_id, numero_visita, ciclo_numero, data_suggerita, data_pianificata, stato, visita_id,
     sedi ( nome, cliente_id, clienti ( ragione_sociale ) ),
     piani_visite ( tecnico_assegnato_id )`
  );
  if (error || !data) return [];

  const rows = (data as unknown as SlotRow[]).map((d) => {
    const sede = first(d.sedi) as { nome: string; cliente_id: string; clienti: unknown } | null;
    const cliente = first(sede?.clienti as { ragione_sociale: string } | { ragione_sociale: string }[] | null);
    const piano = first(d.piani_visite);
    return {
      ...mapSlot(d),
      clienteId: sede?.cliente_id ?? "",
      clienteNome: cliente?.ragione_sociale ?? "—",
      sedeNome: sede?.nome ?? "—",
      tecnicoId: piano?.tecnico_assegnato_id ?? null,
    };
  });

  rows.sort((a, b) =>
    (a.dataPianificata ?? a.dataSuggerita).localeCompare(b.dataPianificata ?? b.dataSuggerita)
  );
  return rows;
}

/**
 * Imposta la data pianificata di uno slot (→ stato 'pianificata'). Non tocca gli
 * slot 'eseguita' (guard server-side: la macchina a stati resta coerente).
 */
export async function updateDataPianificata(slotId: string, dataPianificata: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("visite_pianificate")
    .update({ data_pianificata: dataPianificata, stato: "pianificata" })
    .eq("id", slotId)
    .neq("stato", "eseguita");
  if (error) throw new Error(`Errore aggiornamento data pianificata: ${error.message}`);
}

/** Riepilogo di un piano con stato del ciclo corrente e idoneità al ciclo successivo. */
export interface PianoRiepilogo {
  pianoId: string;
  clienteNome: string;
  sedeNome: string;
  cicloCorrente: number;
  dataInizioCiclo: string;
  visiteAnno: number;
  totaleCicloCorrente: number;
  eseguitiCicloCorrente: number;
  puoGenerareProssimo: boolean;
}

interface PianoRow {
  id: string;
  ciclo_corrente: number;
  data_inizio_ciclo: string;
  visite_anno: number;
  sedi: { nome: string; clienti: unknown } | { nome: string; clienti: unknown }[] | null;
}

/**
 * Riepilogo dei piani con lo stato del ciclo corrente. `puoGenerareProssimo` è
 * true quando tutti gli slot del ciclo corrente sono eseguiti OPPURE la fine del
 * ciclo (data_inizio + 12 mesi) è già passata rispetto a `oggi`.
 */
export async function getPianiConStato(oggi: string): Promise<PianoRiepilogo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("piani_visite")
    .select("id, ciclo_corrente, data_inizio_ciclo, visite_anno, sedi ( nome, clienti ( ragione_sociale ) )");
  if (error || !data) return [];

  const out: PianoRiepilogo[] = [];
  for (const p of data as unknown as PianoRow[]) {
    const sede = first(p.sedi) as { nome: string; clienti: unknown } | null;
    const cliente = first(sede?.clienti as { ragione_sociale: string } | { ragione_sociale: string }[] | null);

    const { data: slots } = await supabase
      .from("visite_pianificate")
      .select("stato")
      .eq("piano_id", p.id)
      .eq("ciclo_numero", p.ciclo_corrente);
    const tot = slots?.length ?? 0;
    const eseguiti = (slots ?? []).filter((s) => s.stato === "eseguita").length;

    const fineCiclo = calcolaScadenza(p.data_inizio_ciclo, 12); // ISO
    const tuttiEseguiti = tot > 0 && eseguiti === tot;
    const cicloFinito = fineCiclo != null && fineCiclo < oggi;

    out.push({
      pianoId: p.id,
      clienteNome: cliente?.ragione_sociale ?? "—",
      sedeNome: sede?.nome ?? "—",
      cicloCorrente: p.ciclo_corrente,
      dataInizioCiclo: p.data_inizio_ciclo,
      visiteAnno: p.visite_anno,
      totaleCicloCorrente: tot,
      eseguitiCicloCorrente: eseguiti,
      puoGenerareProssimo: tuttiEseguiti || cicloFinito,
    });
  }
  out.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome) || a.sedeNome.localeCompare(b.sedeNome));
  return out;
}

export interface SalvaPianoInput {
  sedeId: string;
  dataInizioCiclo: string;
  visiteAnno: number;
  tecnicoAssegnatoId: string | null;
}

/**
 * Crea o aggiorna il piano di una sede.
 * - Nuovo piano → genera gli N slot del ciclo 1 (`genera_slot_ciclo`).
 * - Piano esistente → aggiorna i campi e ricalcola SOLO gli slot non eseguiti
 *   del ciclo corrente (`ricalcola_slot_ciclo`); gli slot eseguiti restano intatti.
 * @returns `{ ricalcolato }` — true se era un aggiornamento (slot rigenerati).
 */
export async function salvaPiano(input: SalvaPianoInput): Promise<{ ricalcolato: boolean }> {
  const supabase = await createClient();
  const esistente = await getPianoBySede(input.sedeId);

  if (!esistente) {
    const { data: piano, error } = await supabase
      .from("piani_visite")
      .insert({
        sede_id: input.sedeId,
        data_inizio_ciclo: input.dataInizioCiclo,
        visite_anno: input.visiteAnno,
        tecnico_assegnato_id: input.tecnicoAssegnatoId,
      })
      .select("id, ciclo_corrente")
      .single();
    if (error || !piano) {
      throw new Error(`Errore creazione piano: ${error?.message ?? "nessun dato"}`);
    }
    const { error: genErr } = await supabase.rpc("genera_slot_ciclo", {
      p_piano_id: piano.id,
      p_sede_id: input.sedeId,
      p_ciclo: piano.ciclo_corrente,
      p_data_inizio: input.dataInizioCiclo,
      p_visite_anno: input.visiteAnno,
    });
    if (genErr) throw new Error(`Errore generazione slot: ${genErr.message}`);
    return { ricalcolato: false };
  }

  const { error: updErr } = await supabase
    .from("piani_visite")
    .update({
      data_inizio_ciclo: input.dataInizioCiclo,
      visite_anno: input.visiteAnno,
      tecnico_assegnato_id: input.tecnicoAssegnatoId,
    })
    .eq("id", esistente.id);
  if (updErr) throw new Error(`Errore aggiornamento piano: ${updErr.message}`);

  const { error: recErr } = await supabase.rpc("ricalcola_slot_ciclo", {
    p_piano_id: esistente.id,
    p_sede_id: input.sedeId,
    p_ciclo: esistente.cicloCorrente,
    p_data_inizio: input.dataInizioCiclo,
    p_visite_anno: input.visiteAnno,
  });
  if (recErr) throw new Error(`Errore ricalcolo slot: ${recErr.message}`);
  return { ricalcolato: true };
}
