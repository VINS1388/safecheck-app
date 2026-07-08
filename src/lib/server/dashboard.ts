import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPianificazione, type SlotPianificazione } from "@/lib/db/queries/pianificazione";
import { getTecniciOpzioni } from "./filtri-opzioni";
import { differenzaGiorni } from "@/lib/scadenze/calcola";
import type { RangeDate } from "@/lib/filters";

/**
 * MODULO DATI UNICO della dashboard (Sprint 16.5). Tutte le query dashboard, per
 * ruolo, in un punto — stesso pattern di organizzazione.ts. La RLS scopa già le
 * righe (specialist → proprie); qui si compone "cosa devo fare adesso", con link
 * querystring verso le pagine di sezione filtrate (nessuno stato duplicato).
 *
 * Bozza = `numero_verbale IS NULL` (criterio unico, come statoVerbaleUI). Le età
 * si calcolano da `data_visita` (data sopralluogo), MAI now() per la soglia.
 */

export interface BozzaRiga {
  id: string;
  clienteNome: string;
  sedeNome: string;
  dataVisita: string;
  giorni: number; // giorni da data_visita a oggi
  vecchia: boolean; // giorni > soglia
}
export interface VisitaRiga {
  id: string;
  clienteNome: string;
  sedeNome: string;
  dataVisita: string;
  numeroVerbale: string | null;
  statoVerbale: string | null;
}
export interface SlotRigaDash {
  id: string;
  clienteId: string;
  sedeId: string;
  clienteNome: string;
  sedeNome: string;
  dataEff: string;
  stato: string;
  tecnicoId: string | null;
  scaduta: boolean;
}
export interface CoperturaRiga {
  sedeId: string;
  clienteNome: string;
  sedeNome: string;
  scoperti: number; // slot "Da assegnare" (senza tecnico, non eseguiti)
  inRitardo: number; // slot con data effettiva passata, non eseguiti
}
export interface CaricoRiga {
  tecnicoId: string;
  tecnicoNome: string;
  assegnate: number;
}
export interface RilievoRiga {
  visitaId: string;
  clienteNome: string;
  sedeNome: string;
  dataVisita: string;
  numeroVerbale: string | null;
  nc: number; // conteggio NC (standard + per-impresa SEZ-08)
  pc: number; // conteggio PC (standard + per-impresa SEZ-08)
}

const SOGLIA_BOZZA_VECCHIA = 7; // giorni (mandato)
// Bucket agenda tecnico (S4): "questa settimana" = rolling 7 giorni in avanti da
// oggi ESCLUSO (oggi ha bucket proprio) → [oggi+1, oggi+7]. Scelta rolling, non
// settimana di calendario, coerente con la convenzione "ultimi/prossimi N giorni".
const FINESTRA_SETTIMANA = 7; // giorni

// ── Helper condivisi ─────────────────────────────────────────────────────────
function slotEff(s: SlotPianificazione): string {
  return s.dataPianificata ?? s.dataSuggerita;
}
function inLavorazione(s: SlotPianificazione): boolean {
  return s.visitaId != null && s.stato !== "eseguita";
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Bozze accessibili (RLS-scopate), con età. `soglia`: filtro >N giorni (planner). */
async function fetchBozze(
  oggi: string,
  opts: { sogliaGiorni?: number; limite?: number }
): Promise<{ righe: BozzaRiga[]; totale: number }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visite")
    .select("id, data_visita, clienti ( ragione_sociale ), sedi ( nome )")
    .is("numero_verbale", null)
    .order("data_visita", { ascending: true }); // più vecchie prima
  const tutte = (data ?? []).map((v) => {
    const rel = v as unknown as {
      id: string;
      data_visita: string;
      clienti: { ragione_sociale: string } | { ragione_sociale: string }[] | null;
      sedi: { nome: string } | { nome: string }[] | null;
    };
    const cliente = Array.isArray(rel.clienti) ? rel.clienti[0] : rel.clienti;
    const sede = Array.isArray(rel.sedi) ? rel.sedi[0] : rel.sedi;
    const giorni = differenzaGiorni(oggi, rel.data_visita);
    return {
      id: rel.id,
      clienteNome: cliente?.ragione_sociale ?? "—",
      sedeNome: sede?.nome ?? "—",
      dataVisita: rel.data_visita,
      giorni,
      vecchia: giorni > SOGLIA_BOZZA_VECCHIA,
    };
  });
  const filtrate =
    opts.sogliaGiorni != null ? tutte.filter((b) => b.giorni > opts.sogliaGiorni!) : tutte;
  return {
    righe: opts.limite ? filtrate.slice(0, opts.limite) : filtrate,
    totale: filtrate.length,
  };
}

/** Ultime visite chiuse accessibili (RLS-scopate). */
async function fetchChiuseRecenti(limite: number): Promise<VisitaRiga[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visite")
    .select("id, data_visita, numero_verbale, stato_verbale, clienti ( ragione_sociale ), sedi ( nome )")
    .eq("stato_verbale", "chiuso")
    .order("data_visita", { ascending: false })
    .limit(limite);
  return (data ?? []).map((v) => {
    const rel = v as unknown as {
      id: string;
      data_visita: string;
      numero_verbale: string | null;
      stato_verbale: string | null;
      clienti: { ragione_sociale: string } | { ragione_sociale: string }[] | null;
      sedi: { nome: string } | { nome: string }[] | null;
    };
    const cliente = Array.isArray(rel.clienti) ? rel.clienti[0] : rel.clienti;
    const sede = Array.isArray(rel.sedi) ? rel.sedi[0] : rel.sedi;
    return {
      id: rel.id,
      clienteNome: cliente?.ragione_sociale ?? "—",
      sedeNome: sede?.nome ?? "—",
      dataVisita: rel.data_visita,
      numeroVerbale: rel.numero_verbale,
      statoVerbale: rel.stato_verbale,
    };
  });
}

/**
 * Rilievi recenti (SOLO INFORMATIVO): verbali chiusi di recente che contengono
 * almeno una NC o PC, col conteggio per esito. Riusa il pattern relazionale di
 * `visiteConNC()` (query su FK indicizzata, nessun JSONB) esteso a NC+PC e agli
 * imprese_appalto SEZ-08. La RLS scopa già le righe (tecnico → solo i propri
 * verbali accessibili). NON esiste alcuno stato aperto/chiuso, presa in carico o
 * scadenza sul rilievo: il tracking follow-up è un dato applicativo non ancora
 * implementato (Sprint 13). Qui si consulta soltanto.
 */
async function fetchRilieviRecenti(limite: number): Promise<RilievoRiga[]> {
  const supabase = await createClient();
  // Finestra di scansione: i verbali chiusi più recenti (cap esplicito a 40 per
  // limitare il fan-out; il widget ne mostra `limite`).
  const { data: chiuseData } = await supabase
    .from("visite")
    .select("id, data_visita, numero_verbale, clienti ( ragione_sociale ), sedi ( nome )")
    .eq("stato_verbale", "chiuso")
    .order("data_visita", { ascending: false })
    .limit(40);
  const visite = (chiuseData ?? []).map((v) => {
    const rel = v as unknown as {
      id: string;
      data_visita: string;
      numero_verbale: string | null;
      clienti: { ragione_sociale: string } | { ragione_sociale: string }[] | null;
      sedi: { nome: string } | { nome: string }[] | null;
    };
    const cliente = Array.isArray(rel.clienti) ? rel.clienti[0] : rel.clienti;
    const sede = Array.isArray(rel.sedi) ? rel.sedi[0] : rel.sedi;
    return {
      id: rel.id,
      clienteNome: cliente?.ragione_sociale ?? "—",
      sedeNome: sede?.nome ?? "—",
      dataVisita: rel.data_visita,
      numeroVerbale: rel.numero_verbale,
    };
  });
  const ids = visite.map((v) => v.id);
  if (ids.length === 0) return [];

  const conteggi = new Map<string, { nc: number; pc: number }>();
  const bump = (vid: string, esito: string) => {
    const cur = conteggi.get(vid) ?? { nc: 0, pc: 0 };
    if (esito === "NC") cur.nc++;
    else if (esito === "PC") cur.pc++;
    conteggi.set(vid, cur);
  };

  const { data: std } = await supabase
    .from("risposte")
    .select("visita_id, valore")
    .in("valore", ["NC", "PC"])
    .in("visita_id", ids);
  for (const r of (std ?? []) as { visita_id: string; valore: string }[]) bump(r.visita_id, r.valore);

  const { data: imp } = await supabase
    .from("risposte_imprese_appalto")
    .select("esito, imprese_appalto!inner ( visita_id )")
    .in("esito", ["NC", "PC"])
    .in("imprese_appalto.visita_id", ids);
  for (const r of (imp ?? []) as unknown as {
    esito: string;
    imprese_appalto: { visita_id: string } | { visita_id: string }[] | null;
  }[]) {
    const ia = Array.isArray(r.imprese_appalto) ? r.imprese_appalto[0] : r.imprese_appalto;
    if (ia?.visita_id) bump(ia.visita_id, r.esito);
  }

  // Preserva l'ordine di recency (visite già ordinate per data_visita desc).
  const righe: RilievoRiga[] = [];
  for (const v of visite) {
    const cc = conteggi.get(v.id);
    if (!cc || cc.nc + cc.pc === 0) continue;
    righe.push({
      visitaId: v.id,
      clienteNome: v.clienteNome,
      sedeNome: v.sedeNome,
      dataVisita: v.dataVisita,
      numeroVerbale: v.numeroVerbale,
      nc: cc.nc,
      pc: cc.pc,
    });
  }
  return righe.slice(0, limite);
}

function slotToRiga(s: SlotPianificazione, oggi: string): SlotRigaDash {
  const eff = slotEff(s);
  return {
    id: s.id,
    clienteId: s.clienteId,
    sedeId: s.sedeId,
    clienteNome: s.clienteNome,
    sedeNome: s.sedeNome,
    dataEff: eff,
    stato: s.stato,
    tecnicoId: s.tecnicoId,
    scaduta: eff < oggi && s.stato !== "eseguita" && !inLavorazione(s),
  };
}

// ── Dashboard TECNICO ────────────────────────────────────────────────────────
export interface DashboardTecnico {
  ruolo: "specialist";
  daCompletare: { righe: BozzaRiga[]; totale: number };
  // Agenda a bucket (S4) — sostituisce la finestra piatta 14gg.
  prossima: SlotRigaDash | null; // visita più imminente in evidenza (eff >= oggi)
  inRitardo: { righe: SlotRigaDash[]; totale: number }; // eff < oggi
  oggi: { righe: SlotRigaDash[]; totale: number }; // eff == oggi
  settimana: { righe: SlotRigaDash[]; totale: number }; // oggi < eff <= oggi+7
  chiuse: VisitaRiga[];
  slotDisponibili: SlotRigaDash[];
  rilievi: RilievoRiga[];
}

/** Slot realmente prendibili dal tecnico: ciclo corrente, liberi, suoi o "Da assegnare". */
async function fetchSlotDisponibili(userId: string, limite: number): Promise<SlotRigaDash[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visite_pianificate")
    .select(
      "id, sede_id, ciclo_numero, data_suggerita, data_pianificata, stato, tecnico_assegnato_id, sedi ( nome, cliente_id, clienti ( ragione_sociale ) ), piani_visite!inner ( ciclo_corrente )"
    )
    .is("visita_id", null)
    .in("stato", ["da_pianificare", "pianificata"])
    .or(`tecnico_assegnato_id.eq.${userId},tecnico_assegnato_id.is.null`);
  const righe: SlotRigaDash[] = [];
  for (const r of (data ?? []) as unknown as {
    id: string;
    sede_id: string;
    ciclo_numero: number;
    data_suggerita: string;
    data_pianificata: string | null;
    stato: string;
    tecnico_assegnato_id: string | null;
    sedi: { nome: string; cliente_id: string; clienti: { ragione_sociale: string } | { ragione_sociale: string }[] | null } | { nome: string; cliente_id: string; clienti: unknown }[] | null;
    piani_visite: { ciclo_corrente: number } | { ciclo_corrente: number }[] | null;
  }[]) {
    const piano = Array.isArray(r.piani_visite) ? r.piani_visite[0] : r.piani_visite;
    if (!piano || r.ciclo_numero !== piano.ciclo_corrente) continue; // solo ciclo corrente
    const sede = Array.isArray(r.sedi) ? r.sedi[0] : r.sedi;
    const cliente = sede ? (Array.isArray(sede.clienti) ? sede.clienti[0] : sede.clienti) : null;
    righe.push({
      id: r.id,
      clienteId: sede?.cliente_id ?? "",
      sedeId: r.sede_id,
      clienteNome: (cliente as { ragione_sociale: string } | null)?.ragione_sociale ?? "—",
      sedeNome: sede?.nome ?? "—",
      dataEff: r.data_pianificata ?? r.data_suggerita,
      stato: r.stato,
      tecnicoId: r.tecnico_assegnato_id,
      scaduta: false,
    });
  }
  righe.sort((a, b) => a.dataEff.localeCompare(b.dataEff));
  return righe.slice(0, limite);
}

export async function getDashboardTecnico(userId: string, oggi: string): Promise<DashboardTecnico> {
  const [daCompletare, slots, chiuse, slotDisponibili, rilievi] = await Promise.all([
    fetchBozze(oggi, { limite: 5 }),
    getPianificazione(), // scopato: suoi assegnati + collegati a sua visita
    fetchChiuseRecenti(3),
    fetchSlotDisponibili(userId, 3),
    fetchRilieviRecenti(5),
  ]);

  const oggiPiuSettimana = addDays(oggi, FINESTRA_SETTIMANA); // oggi+7

  // Solo gli slot del tecnico ancora da eseguire, ordinati per data effettiva.
  const miei = slots
    .filter((s) => s.tecnicoId === userId && s.stato !== "eseguita")
    .sort((a, b) => slotEff(a).localeCompare(slotEff(b)));

  // Bucket per data effettiva (dichiarati in FINESTRA_SETTIMANA). "In ritardo"
  // esclude gli slot già in lavorazione (visita collegata non ancora eseguita),
  // coerente con `slotToRiga.scaduta`.
  const inRitardo = miei.filter((s) => slotEff(s) < oggi && !inLavorazione(s));
  const oggiSlot = miei.filter((s) => slotEff(s) === oggi);
  const settimana = miei.filter((s) => {
    const eff = slotEff(s);
    return eff > oggi && eff <= oggiPiuSettimana;
  });
  // Visita più imminente in evidenza: la prima (già ordinata) con eff >= oggi.
  const prossimaSlot = miei.find((s) => slotEff(s) >= oggi) ?? null;

  return {
    ruolo: "specialist",
    daCompletare,
    prossima: prossimaSlot ? slotToRiga(prossimaSlot, oggi) : null,
    inRitardo: { righe: inRitardo.slice(0, 5).map((s) => slotToRiga(s, oggi)), totale: inRitardo.length },
    oggi: { righe: oggiSlot.slice(0, 5).map((s) => slotToRiga(s, oggi)), totale: oggiSlot.length },
    settimana: { righe: settimana.slice(0, 5).map((s) => slotToRiga(s, oggi)), totale: settimana.length },
    chiuse,
    slotDisponibili,
    rilievi,
  };
}

// ── Dashboard GESTIONE (planner + admin) ─────────────────────────────────────
export interface AdminKpi {
  visiteChiuse: number; // periodo
  ncRilevate: number; // periodo
  bozzeAperte: number; // snapshot
  slotScoperti: number; // snapshot
}
export interface PlannerKpi {
  slotScoperti: number; // slot senza tecnico, non eseguiti (snapshot)
  slotInRitardo: number; // slot con eff < oggi, non eseguiti né in lavorazione (snapshot)
  sediInRitardo: number; // sedi distinte con >=1 slot in ritardo (snapshot)
  bozzeVecchie: number; // bozze aperte da oltre SOGLIA_BOZZA_VECCHIA giorni (snapshot)
}
export interface DashboardGestione {
  ruolo: "planner" | "admin";
  kpi: AdminKpi | null; // solo admin
  plannerKpi: PlannerKpi | null; // solo planner
  slotDaAssegnare: { righe: SlotRigaDash[]; totale: number };
  copertura: { righe: CoperturaRiga[]; totale: number };
  carico: CaricoRiga[];
  bozzeVecchie: { righe: BozzaRiga[]; totale: number };
  rilievi: RilievoRiga[]; // feed attenzione cross-cliente (solo informativo)
}

async function fetchAdminKpi(oggi: string, range: RangeDate): Promise<AdminKpi> {
  const supabase = await createClient();

  // Visite chiuse nel periodo
  let qChiuse = supabase.from("visite").select("id", { count: "exact", head: false }).eq("stato_verbale", "chiuso");
  if (range.da) qChiuse = qChiuse.gte("data_visita", range.da);
  if (range.a) qChiuse = qChiuse.lte("data_visita", range.a);
  const { data: chiuse } = await qChiuse;
  const idsChiuse = (chiuse ?? []).map((r) => (r as { id: string }).id);

  // NC rilevate nel periodo (standard + per-impresa) sui verbali chiusi del periodo
  let ncRilevate = 0;
  if (idsChiuse.length > 0) {
    const { count: ncStd } = await supabase
      .from("risposte")
      .select("id", { count: "exact", head: true })
      .eq("valore", "NC")
      .in("visita_id", idsChiuse);
    const { count: ncImp } = await supabase
      .from("risposte_imprese_appalto")
      .select("imprese_appalto!inner ( visita_id )", { count: "exact", head: true })
      .eq("esito", "NC")
      .in("imprese_appalto.visita_id", idsChiuse);
    ncRilevate = (ncStd ?? 0) + (ncImp ?? 0);
  }

  const { count: bozzeAperte } = await supabase
    .from("visite")
    .select("id", { count: "exact", head: true })
    .is("numero_verbale", null);

  const { count: slotScoperti } = await supabase
    .from("visite_pianificate")
    .select("id", { count: "exact", head: true })
    .is("tecnico_assegnato_id", null)
    .neq("stato", "eseguita");

  return {
    visiteChiuse: idsChiuse.length,
    ncRilevate,
    bozzeAperte: bozzeAperte ?? 0,
    slotScoperti: slotScoperti ?? 0,
  };
}

export async function getDashboardGestione(
  ruolo: "planner" | "admin",
  oggi: string,
  range: RangeDate
): Promise<DashboardGestione> {
  const [slots, bozzeVecchie, roster, kpi, rilievi] = await Promise.all([
    getPianificazione(), // planner/admin: tutti gli slot
    fetchBozze(oggi, { sogliaGiorni: SOGLIA_BOZZA_VECCHIA, limite: 5 }),
    getTecniciOpzioni(),
    ruolo === "admin" ? fetchAdminKpi(oggi, range) : Promise.resolve(null),
    fetchRilieviRecenti(6),
  ]);

  // Slot da assegnare
  const daAssegnare = slots
    .filter((s) => s.tecnicoId == null && s.stato !== "eseguita")
    .sort((a, b) => slotEff(a).localeCompare(slotEff(b)));

  // Copertura piani: per sede, slot scoperti (da assegnare) + in ritardo (eff passata, non eseguito)
  const perSede = new Map<string, CoperturaRiga>();
  for (const s of slots) {
    const eff = slotEff(s);
    const scoperto = s.tecnicoId == null && s.stato !== "eseguita";
    const ritardo = eff < oggi && s.stato !== "eseguita" && !inLavorazione(s);
    if (!scoperto && !ritardo) continue;
    const cur =
      perSede.get(s.sedeId) ??
      { sedeId: s.sedeId, clienteNome: s.clienteNome, sedeNome: s.sedeNome, scoperti: 0, inRitardo: 0 };
    if (scoperto) cur.scoperti++;
    if (ritardo) cur.inRitardo++;
    perSede.set(s.sedeId, cur);
  }
  const copertura = Array.from(perSede.values()).sort(
    (a, b) => b.scoperti + b.inRitardo - (a.scoperti + a.inRitardo)
  );

  // Carico tecnici: slot con tecnico assegnato e data effettiva nel periodo
  const nome = new Map(roster.map((t) => [t.value, t.label]));
  const conteggio = new Map<string, number>();
  for (const s of slots) {
    if (!s.tecnicoId) continue;
    const eff = slotEff(s);
    if (range.da && eff < range.da) continue;
    if (range.a && eff > range.a) continue;
    conteggio.set(s.tecnicoId, (conteggio.get(s.tecnicoId) ?? 0) + 1);
  }
  const carico: CaricoRiga[] = Array.from(conteggio.entries())
    .map(([tecnicoId, assegnate]) => ({ tecnicoId, tecnicoNome: nome.get(tecnicoId) ?? "—", assegnate }))
    .sort((a, b) => b.assegnate - a.assegnate);

  // KPI planner (snapshot) — pura aggregazione dei dati già recuperati sopra
  // (slots RLS-scopati + bozzeVecchie + copertura). Nessuna query nuova.
  const slotInRitardo = slots.filter(
    (s) => slotEff(s) < oggi && s.stato !== "eseguita" && !inLavorazione(s)
  ).length;
  const plannerKpi: PlannerKpi | null =
    ruolo === "planner"
      ? {
          slotScoperti: daAssegnare.length,
          slotInRitardo,
          sediInRitardo: copertura.filter((c) => c.inRitardo > 0).length,
          bozzeVecchie: bozzeVecchie.totale,
        }
      : null;

  return {
    ruolo,
    kpi,
    plannerKpi,
    slotDaAssegnare: { righe: daAssegnare.slice(0, 5).map((s) => slotToRiga(s, oggi)), totale: daAssegnare.length },
    copertura: { righe: copertura.slice(0, 5), totale: copertura.length },
    carico,
    bozzeVecchie,
    rilievi,
  };
}
