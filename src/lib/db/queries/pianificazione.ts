import { createClient } from "@/lib/supabase/server";
import { calcolaScadenza } from "@/lib/scadenze/calcola";
import { getScopeVisibilita } from "@/lib/auth/scope";
import { getModuloSicurezzaId } from "@/lib/db/queries/moduli";
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
  tecnicoId: string | null;          // tecnico DELLO SLOT (Sprint 15.2)
  tecnicoPersonalizzato: boolean;    // true = assegnato a mano, non segue il default piano
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
  tecnico_assegnato_id: string | null;
  tecnico_personalizzato: boolean;
  sedi: { nome: string; cliente_id: string; clienti: { ragione_sociale: string } | { ragione_sociale: string }[] | null } | { nome: string; cliente_id: string; clienti: unknown }[] | null;
}

/**
 * Tutti gli slot pianificati, arricchiti con cliente/sede/tecnico, ordinati per
 * data effettiva (COALESCE(data_pianificata, data_suggerita)) crescente.
 * Il tecnico è quello DELLO SLOT (Sprint 15.2), non più del piano.
 */
export async function getPianificazione(): Promise<SlotPianificazione[]> {
  const supabase = await createClient();

  // Sprint 16: filtro applicativo per ruolo. Il tecnico vede solo gli slot a lui
  // assegnati o collegati a una sua visita (coerente con la futura RLS su
  // visite_pianificate); admin/planner vedono tutto.
  const scope = await getScopeVisibilita();
  if (scope.mode === "none") return [];

  let q = supabase.from("visite_pianificate").select(
    `id, piano_id, sede_id, numero_visita, ciclo_numero, data_suggerita, data_pianificata, stato, visita_id,
     tecnico_assegnato_id, tecnico_personalizzato,
     sedi ( nome, cliente_id, clienti ( ragione_sociale ) )`
  );

  if (scope.mode === "tecnico") {
    const visitaList = Array.from(scope.visitaIds);
    const orParts = [`tecnico_assegnato_id.eq.${scope.userId}`];
    if (visitaList.length > 0) orParts.push(`visita_id.in.(${visitaList.join(",")})`);
    q = q.or(orParts.join(","));
  }

  const { data, error } = await q;
  if (error || !data) return [];

  const rows = (data as unknown as SlotRow[]).map((d) => {
    const sede = first(d.sedi) as { nome: string; cliente_id: string; clienti: unknown } | null;
    const cliente = first(sede?.clienti as { ragione_sociale: string } | { ragione_sociale: string }[] | null);
    return {
      ...mapSlot(d),
      clienteId: sede?.cliente_id ?? "",
      clienteNome: cliente?.ragione_sociale ?? "—",
      sedeNome: sede?.nome ?? "—",
      tecnicoId: d.tecnico_assegnato_id ?? null,
      tecnicoPersonalizzato: d.tecnico_personalizzato ?? false,
    };
  });

  rows.sort((a, b) =>
    (a.dataPianificata ?? a.dataSuggerita).localeCompare(b.dataPianificata ?? b.dataSuggerita)
  );
  return rows;
}

/** Opzioni di filtro per la pianificazione (Sprint 16.5). Tutte facoltative. */
export interface FiltriPianificazione {
  clienteId?: string;
  sedeId?: string;
  tecnicoId?: string;
  stato?: string; // da_assegnare | da_pianificare | pianificata | in_lavorazione | eseguita
  dataDa?: string; // ISO, su data effettiva (pianificata ?? suggerita)
  dataA?: string;
}

/**
 * Pianificazione filtrata (Sprint 16.5). Riusa `getPianificazione` (già scopata
 * per ruolo dalla RLS/scope) e narrowa in memoria — il dataset è piccolo
 * (single-tenant). Stati derivati: `da_assegnare` (senza tecnico, non eseguito) e
 * `in_lavorazione` (bozza collegata, non eseguito). Il periodo è sulla data
 * effettiva; l'assenza di dataDa/dataA = nessuna restrizione (default "sempre").
 */
export async function getPianificazioneFiltrata(
  f: FiltriPianificazione
): Promise<SlotPianificazione[]> {
  const slots = await getPianificazione();
  return slots.filter((s) => {
    if (f.clienteId && s.clienteId !== f.clienteId) return false;
    if (f.sedeId && s.sedeId !== f.sedeId) return false;
    if (f.tecnicoId && s.tecnicoId !== f.tecnicoId) return false;
    if (f.stato) {
      if (f.stato === "da_assegnare") {
        if (!(s.tecnicoId == null && s.stato !== "eseguita")) return false;
      } else if (f.stato === "in_lavorazione") {
        if (!(s.visitaId != null && s.stato !== "eseguita")) return false;
      } else if (s.stato !== f.stato) {
        return false;
      }
    }
    if (f.dataDa || f.dataA) {
      const eff = s.dataPianificata ?? s.dataSuggerita;
      if (f.dataDa && eff < f.dataDa) return false;
      if (f.dataA && eff > f.dataA) return false;
    }
    return true;
  });
}

/** Slot proponibile alla creazione di una nuova visita (ciclo corrente, ancora libero). */
export interface SlotProponibile {
  id: string;
  numeroVisita: number;
  totale: number; // N visite del ciclo (per l'etichetta "N/T")
  dataEffettiva: string; // data_pianificata ?? data_suggerita
  isSuggerita: boolean; // true se non c'è ancora una data pianificata
  tecnicoId: string | null;
  tecnicoNome: string | null;
}

/**
 * Slot collegabili a una nuova visita per una sede: SOLO ciclo corrente,
 * `visita_id IS NULL`, stato in ('da_pianificare','pianificata'), ordinati per
 * numero_visita. Vuoto se la sede non ha piano o non ha slot liberi.
 *
 * Sprint 16 — coerenza APP↔RLS: per il tecnico si mostrano SOLO gli slot suoi o
 * "Da assegnare" (`tecnico_assegnato_id = self OR IS NULL`) — gli slot Da
 * assegnare restano visibili nel selettore (presa in carico diretta, P6.1); gli
 * slot di ALTRI tecnici non sono più proponibili. admin/planner vedono tutto.
 * Mirror della policy RLS `vp_select_scope`.
 */
export async function getSlotProponibiliBySede(sedeId: string): Promise<SlotProponibile[]> {
  const scope = await getScopeVisibilita();
  if (scope.mode === "none") return [];

  const supabase = await createClient();
  const { data: piano } = await supabase
    .from("piani_visite")
    .select("id, ciclo_corrente, visite_anno")
    .eq("sede_id", sedeId)
    .maybeSingle();
  if (!piano) return [];

  let q = supabase
    .from("visite_pianificate")
    .select("id, numero_visita, data_suggerita, data_pianificata, tecnico_assegnato_id")
    .eq("piano_id", piano.id)
    .eq("ciclo_numero", piano.ciclo_corrente)
    .is("visita_id", null)
    .in("stato", ["da_pianificare", "pianificata"]);

  if (scope.mode === "tecnico") {
    q = q.or(`tecnico_assegnato_id.eq.${scope.userId},tecnico_assegnato_id.is.null`);
  }

  const { data: slots } = await q.order("numero_visita", { ascending: true });
  if (!slots || slots.length === 0) return [];

  // Nomi tecnici (anche non attivi, per un'etichetta sempre leggibile).
  const ids = Array.from(
    new Set(slots.map((s) => s.tecnico_assegnato_id).filter((x): x is string => !!x))
  );
  const nomi = new Map<string, string>();
  if (ids.length > 0) {
    const { data: utenti } = await supabase
      .from("utenti")
      .select("id, nome_completo")
      .in("id", ids);
    for (const u of utenti ?? []) nomi.set(u.id, u.nome_completo);
  }

  return slots.map((s) => ({
    id: s.id,
    numeroVisita: s.numero_visita,
    totale: piano.visite_anno,
    dataEffettiva: s.data_pianificata ?? s.data_suggerita,
    isSuggerita: s.data_pianificata == null,
    tecnicoId: s.tecnico_assegnato_id ?? null,
    tecnicoNome: s.tecnico_assegnato_id ? nomi.get(s.tecnico_assegnato_id) ?? null : null,
  }));
}

/** Sedi di un cliente che hanno ≥1 slot proponibile nel ciclo corrente. */
export async function getSediConSlotProponibili(clienteId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visite_pianificate")
    .select(
      "sede_id, ciclo_numero, piani_visite!inner ( ciclo_corrente ), sedi!inner ( cliente_id )"
    )
    .eq("sedi.cliente_id", clienteId)
    .is("visita_id", null)
    .in("stato", ["da_pianificare", "pianificata"]);
  const out = new Set<string>();
  for (const r of (data ?? []) as unknown as {
    sede_id: string;
    ciclo_numero: number;
    piani_visite: { ciclo_corrente: number } | { ciclo_corrente: number }[] | null;
  }[]) {
    const piano = first(r.piani_visite);
    if (piano && r.ciclo_numero === piano.ciclo_corrente) out.add(r.sede_id);
  }
  return out;
}

/**
 * Riverifica server-side (anti-concorrenza) che un singolo slot sia ancora
 * proponibile: ciclo corrente del suo piano, libero, non eseguito.
 */
export async function slotAncoraProponibile(slotId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visite_pianificate")
    .select("ciclo_numero, visita_id, stato, piani_visite!inner ( ciclo_corrente )")
    .eq("id", slotId)
    .maybeSingle();
  if (!data) return false;
  const piano = first(
    (data as { piani_visite: { ciclo_corrente: number } | { ciclo_corrente: number }[] | null }).piani_visite
  );
  return (
    data.visita_id == null &&
    (data.stato === "da_pianificare" || data.stato === "pianificata") &&
    !!piano &&
    data.ciclo_numero === piano.ciclo_corrente
  );
}

/**
 * Collega uno slot a una visita in modo ATOMICO (Opzione A: lo stato resta
 * invariato — la transizione a 'eseguita' avverrà alla chiusura del verbale).
 * Guard `visita_id IS NULL AND stato <> 'eseguita'`: se 0 righe → un'altra visita
 * ha vinto la corsa (o lo slot è di un altro tecnico, negato dalla RLS). Ritorna
 * true se collegato.
 *
 * Sprint 16 — PRESA IN CARICO ESPLICITA (P6.1): se lo slot è "Da assegnare"
 * (`tecnico_assegnato_id IS NULL`) il collegamento assegna nella STESSA UPDATE lo
 * slot al creatore (`tecnico_assegnato_id = creatorId`, `tecnico_personalizzato =
 * true`), così non resta "Da assegnare" con una visita collegata (incoerente in
 * /pianificazione) e l'assegnazione esplicita non verrà sovrascritta da un futuro
 * cambio del tecnico default del piano. Se lo slot è già assegnato (al creatore o,
 * per admin, a chiunque) il collegamento tocca SOLO `visita_id`, senza alterare
 * tecnico/flag. Le due UPDATE sono guardate da `visita_id IS NULL` → nessuna corsa.
 */
export async function collegaSlot(
  slotId: string,
  visitaId: string,
  creatorId: string
): Promise<boolean> {
  const supabase = await createClient();

  // Sprint HACCP 1 — coerenza di modulo: la visita deve appartenere allo stesso
  // modulo del piano dello slot. Con un solo modulo è sempre coerente; a H2
  // impedisce di agganciare una visita HACCP a uno slot di un piano sicurezza.
  const [{ data: slotRow }, { data: vis }] = await Promise.all([
    supabase.from("visite_pianificate").select("piani_visite!inner ( modulo_id )").eq("id", slotId).maybeSingle(),
    supabase.from("visite").select("modulo_id").eq("id", visitaId).maybeSingle(),
  ]);
  const piano = first(
    (slotRow as { piani_visite: { modulo_id: string } | { modulo_id: string }[] | null } | null)?.piani_visite
  );
  if (piano && vis && piano.modulo_id !== (vis as { modulo_id: string }).modulo_id) {
    return false; // modulo incoerente: non collegare
  }

  // 1) Slot "Da assegnare" → presa in carico esplicita del creatore.
  const { data: preso, error: errPreso } = await supabase
    .from("visite_pianificate")
    .update({
      visita_id: visitaId,
      tecnico_assegnato_id: creatorId,
      tecnico_personalizzato: true,
    })
    .eq("id", slotId)
    .is("visita_id", null)
    .is("tecnico_assegnato_id", null)
    .neq("stato", "eseguita")
    .select("id");
  if (errPreso) throw new Error(`Errore collegamento slot: ${errPreso.message}`);
  if ((preso?.length ?? 0) > 0) return true;

  // 2) Slot già assegnato → collega SOLO la visita, tecnico/flag invariati.
  const { data, error } = await supabase
    .from("visite_pianificate")
    .update({ visita_id: visitaId })
    .eq("id", slotId)
    .is("visita_id", null)
    .neq("stato", "eseguita")
    .select("id");
  if (error) throw new Error(`Errore collegamento slot: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Verifica che un tecnico esista e sia attivo (validazione server-side del dropdown). */
async function tecnicoAttivo(tecnicoId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("utenti")
    .select("id")
    .eq("id", tecnicoId)
    .eq("attivo", true)
    .maybeSingle();
  return !!data;
}

/**
 * Salva le modifiche inline di uno slot: data pianificata e/o tecnico. Solo i
 * campi realmente modificati vengono passati (dirty-tracking lato client) —
 * `undefined` = non toccato, così un salvataggio della sola data non altera il
 * tecnico né il flag, e viceversa.
 * - `dataPianificata` presente → set data + stato 'pianificata'.
 * - `tecnico` presente → assegnazione ESPLICITA: tecnico + `tecnico_personalizzato = true`
 *   SEMPRE (anche se coincide col default del piano). Valida che il tecnico
 *   (se non null) esista e sia attivo.
 * Guard: mai su slot 'eseguita'.
 */
export async function salvaModificheSlot(
  slotId: string,
  input: { dataPianificata?: string; tecnico?: { id: string | null } }
): Promise<void> {
  const upd: Record<string, unknown> = {};

  if (input.dataPianificata !== undefined) {
    if (!input.dataPianificata) throw new Error("Data pianificata non valida.");
    upd.data_pianificata = input.dataPianificata;
    upd.stato = "pianificata";
  }

  if (input.tecnico !== undefined) {
    const id = input.tecnico.id;
    if (id && !(await tecnicoAttivo(id))) {
      throw new Error("Il tecnico selezionato non è valido o non è più attivo.");
    }
    upd.tecnico_assegnato_id = id;
    upd.tecnico_personalizzato = true; // assegnazione esplicita, senza eccezioni
  }

  if (Object.keys(upd).length === 0) return; // niente da salvare

  const supabase = await createClient();
  const { error } = await supabase
    .from("visite_pianificate")
    .update(upd)
    .eq("id", slotId)
    .neq("stato", "eseguita");
  if (error) throw new Error(`Errore salvataggio slot: ${error.message}`);
}

/**
 * Ripristina il tecnico di uno slot al default corrente del piano
 * (`tecnico_personalizzato = false`): lo slot torna a seguire i futuri cambi di
 * default. Non tocca data/stato. Guard: mai su slot 'eseguita'.
 */
export async function ripristinaTecnicoDefault(slotId: string): Promise<void> {
  const supabase = await createClient();
  const { data: slot } = await supabase
    .from("visite_pianificate")
    .select("piano_id")
    .eq("id", slotId)
    .maybeSingle();
  if (!slot) throw new Error("Slot non trovato.");

  const { data: piano } = await supabase
    .from("piani_visite")
    .select("tecnico_assegnato_id")
    .eq("id", slot.piano_id)
    .maybeSingle();

  const { error } = await supabase
    .from("visite_pianificate")
    .update({
      tecnico_assegnato_id: piano?.tecnico_assegnato_id ?? null,
      tecnico_personalizzato: false,
    })
    .eq("id", slotId)
    .neq("stato", "eseguita");
  if (error) throw new Error(`Errore ripristino default: ${error.message}`);
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
  moduloId?: string; // Sprint HACCP 1: default 'sicurezza' (un solo modulo oggi)
}

/** Esito del salvataggio piano — guida il messaggio in UI e la conferma di ricalcolo. */
export type EsitoSalvaPiano = "creato" | "ricalcolato" | "tecnico_aggiornato";

/**
 * Crea o aggiorna il piano di una sede.
 * - Nuovo piano → genera gli N slot del ciclo 1 (`genera_slot_ciclo`). → `creato`.
 * - Piano esistente, cambio STRUTTURALE (data inizio o numero visite) → aggiorna
 *   i campi e ricalcola gli slot non eseguiti del ciclo corrente
 *   (`ricalcola_slot_ciclo`, che preserva gli slot personalizzati via flag).
 *   → `ricalcolato`.
 * - Piano esistente, cambia SOLO il tecnico default (data/numero invariati) →
 *   nessuna rigenerazione (sarebbe distruttiva per le date): UPDATE mirato del
 *   default sui soli slot NON personalizzati e NON eseguiti del ciclo corrente.
 *   → `tecnico_aggiornato`. Gli slot con `tecnico_personalizzato = true` restano
 *   intatti; il cambio propaga solo a chi segue il default.
 * In tutti i casi gli slot `eseguita` non vengono mai toccati.
 */
export async function salvaPiano(input: SalvaPianoInput): Promise<{ esito: EsitoSalvaPiano }> {
  const supabase = await createClient();
  const esistente = await getPianoBySede(input.sedeId);

  if (!esistente) {
    const moduloId = input.moduloId ?? (await getModuloSicurezzaId());

    // Enforcement server-side (Sprint HACCP 2, C1): un piano HACCP è creabile solo
    // su una sede con quel modulo attivo (idem sicurezza). Guida UI a monte, ma la
    // sicurezza è QUI. Gate SECURITY DEFINER, coerente con creaVisita.
    const { data: consentito, error: errGate } = await supabase.rpc(
      "can_creare_visita_con_modulo",
      { p_sede_id: input.sedeId, p_modulo_id: moduloId }
    );
    if (errGate) throw new Error(`Verifica modulo non riuscita: ${errGate.message}`);
    if (!consentito) {
      throw new Error("Il modulo selezionato non è attivo su questa sede: piano non creabile.");
    }

    const { data: piano, error } = await supabase
      .from("piani_visite")
      .insert({
        sede_id: input.sedeId,
        data_inizio_ciclo: input.dataInizioCiclo,
        visite_anno: input.visiteAnno,
        tecnico_assegnato_id: input.tecnicoAssegnatoId,
        modulo_id: moduloId,
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
    return { esito: "creato" };
  }

  const strutturale =
    input.dataInizioCiclo !== esistente.dataInizioCiclo ||
    input.visiteAnno !== esistente.visiteAnno;

  const { error: updErr } = await supabase
    .from("piani_visite")
    .update({
      data_inizio_ciclo: input.dataInizioCiclo,
      visite_anno: input.visiteAnno,
      tecnico_assegnato_id: input.tecnicoAssegnatoId,
    })
    .eq("id", esistente.id);
  if (updErr) throw new Error(`Errore aggiornamento piano: ${updErr.message}`);

  if (!strutturale) {
    // Solo tecnico default cambiato: propaga ai soli slot non personalizzati del
    // ciclo corrente, senza toccare date/stati. Il flag protegge le assegnazioni
    // esplicite del planner.
    const { error: propErr } = await supabase
      .from("visite_pianificate")
      .update({ tecnico_assegnato_id: input.tecnicoAssegnatoId })
      .eq("piano_id", esistente.id)
      .eq("ciclo_numero", esistente.cicloCorrente)
      .eq("tecnico_personalizzato", false)
      .neq("stato", "eseguita");
    if (propErr) throw new Error(`Errore aggiornamento tecnico default: ${propErr.message}`);
    return { esito: "tecnico_aggiornato" };
  }

  const { error: recErr } = await supabase.rpc("ricalcola_slot_ciclo", {
    p_piano_id: esistente.id,
    p_sede_id: input.sedeId,
    p_ciclo: esistente.cicloCorrente,
    p_data_inizio: input.dataInizioCiclo,
    p_visite_anno: input.visiteAnno,
  });
  if (recErr) throw new Error(`Errore ricalcolo slot: ${recErr.message}`);
  return { esito: "ricalcolato" };
}
