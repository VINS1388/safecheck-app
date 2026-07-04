import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";
import type { Sede, EsitoOperazione } from "./sedi";
import { getScopeVisibilita } from "@/lib/auth/scope";

export type Cliente = Tables<"clienti">;

/** Riga sintetica per la lista clienti. */
export interface ClienteRiepilogo {
  id: string;
  ragione_sociale: string;
  citta: string | null;
  n_sedi: number;
}

/** Cliente con le sue sedi, per la scheda di dettaglio. */
export interface ClienteConSedi extends Cliente {
  sedi: Sede[];
}

export interface CreaClienteInput {
  ragione_sociale: string;
  citta: string;
  provincia: string;
  partita_iva?: string | null;
  indirizzo_sede_legale?: string | null;
  referente_principale?: string | null;
  email_referente?: string | null;
}

/**
 * Lista clienti attivi con il numero di sedi, ordinati per ragione sociale.
 * Sprint 16: filtro applicativo per ruolo (UX/perf, coerente con la futura RLS) —
 * il tecnico vede solo i clienti raggiungibili (via visite proprie o slot
 * assegnati); admin/planner vedono tutto.
 */
export async function getClienti(): Promise<ClienteRiepilogo[]> {
  const supabase = await createClient();

  const scope = await getScopeVisibilita();
  if (scope.mode === "none") return [];

  let q = supabase
    .from("clienti")
    .select("id, ragione_sociale, citta, sedi(count)")
    .eq("attivo", true)
    .order("ragione_sociale", { ascending: true });

  if (scope.mode === "tecnico") {
    if (scope.clienteIds.size === 0) return [];
    q = q.in("id", Array.from(scope.clienteIds));
  }

  const { data, error } = await q;

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    ragione_sociale: string;
    citta: string | null;
    sedi: { count: number }[] | null;
  }>).map((c) => ({
    id: c.id,
    ragione_sociale: c.ragione_sociale,
    citta: c.citta,
    n_sedi: c.sedi?.[0]?.count ?? 0,
  }));
}

/** Cliente con le sedi attive risolte. Null se inesistente o non accessibile. */
export async function getClienteById(id: string): Promise<ClienteConSedi | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clienti")
    .select("*, sedi(*)")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const cliente = data as unknown as ClienteConSedi;
  const sedi = (cliente.sedi ?? [])
    .filter((s) => s.attiva)
    // Principale per prima, poi ordine alfabetico per nome.
    .sort((a, b) =>
      a.principale === b.principale
        ? a.nome.localeCompare(b.nome)
        : a.principale
          ? -1
          : 1
    );

  return { ...cliente, sedi };
}

/** Inserisce un nuovo cliente. Ritorna l'id creato. */
export async function creaCliente(dati: CreaClienteInput): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clienti")
    .insert({
      ragione_sociale: dati.ragione_sociale,
      citta: dati.citta,
      provincia: dati.provincia,
      partita_iva: dati.partita_iva ?? null,
      indirizzo_sede_legale: dati.indirizzo_sede_legale ?? null,
      referente_principale: dati.referente_principale ?? null,
      email_referente: dati.email_referente ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Errore creazione cliente: ${error?.message ?? "sconosciuto"}`);
  }

  return data.id;
}

export interface AggiornaClienteInput {
  ragione_sociale: string;
  citta: string;
  provincia: string;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  indirizzo_sede_legale?: string | null;
  cap?: string | null;
  referente_principale?: string | null;
  telefono_referente?: string | null;
  email_referente?: string | null;
}

/** Aggiorna l'anagrafica (sede legale) di un cliente. */
export async function aggiornaCliente(
  id: string,
  dati: AggiornaClienteInput
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("clienti")
    .update({
      ragione_sociale: dati.ragione_sociale,
      citta: dati.citta,
      provincia: dati.provincia,
      partita_iva: dati.partita_iva ?? null,
      codice_fiscale: dati.codice_fiscale ?? null,
      indirizzo_sede_legale: dati.indirizzo_sede_legale ?? null,
      cap: dati.cap ?? null,
      referente_principale: dati.referente_principale ?? null,
      telefono_referente: dati.telefono_referente ?? null,
      email_referente: dati.email_referente ?? null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Errore aggiornamento cliente: ${error.message}`);
  }
}

/**
 * Elimina (soft-delete: `attivo=false`) un cliente, SOLO se non ha visite
 * collegate — l'integrità storica dei verbali non va mai rotta. Le sedi
 * operative restano nel DB ma il cliente sparisce dagli elenchi attivi.
 */
export async function eliminaCliente(id: string): Promise<EsitoOperazione> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("visite")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      motivo: `Il cliente ha ${count} visit${count === 1 ? "a" : "e"} collegat${
        count === 1 ? "a" : "e"
      }: non può essere eliminato (integrità storica dei verbali).`,
    };
  }

  const { error } = await supabase
    .from("clienti")
    .update({ attivo: false })
    .eq("id", id);

  if (error) {
    return { ok: false, motivo: `Errore eliminazione cliente: ${error.message}` };
  }
  return { ok: true };
}

// ── Aggregati dashboard (RPC SQL, vedi migration 013) ──────────────────────

export interface DashboardKpi {
  clienti_attivi: number;
  verbali_totali: number;
  nc_verbali_chiusi: number;
  ultimo_sopralluogo: string | null;
}

export interface DashboardCliente {
  id: string;
  ragione_sociale: string;
  citta: string | null;
  n_sedi: number;
  n_verbali: number;
  ultima_visita: string | null;
}

/** KPI aggregati di studio (1 query, aggregazione lato DB). */
export async function getDashboardKpi(): Promise<DashboardKpi> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_kpi");
  if (error || !data || data.length === 0) {
    return { clienti_attivi: 0, verbali_totali: 0, nc_verbali_chiusi: 0, ultimo_sopralluogo: null };
  }
  return data[0] as DashboardKpi;
}

/** Rollup per-cliente per l'elenco dashboard (1 query, GROUP BY lato DB). */
export async function getDashboardClienti(): Promise<DashboardCliente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_clienti");
  if (error || !data) return [];
  return data as DashboardCliente[];
}
