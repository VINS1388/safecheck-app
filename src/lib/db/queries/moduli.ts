import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canManagePlanning } from "@/lib/auth/rbac";

/**
 * Modulo dati "moduli" (Sprint HACCP 1 · Fase C). Catalogo moduli + attivazione
 * per sede. Enforcement admin/planner co-localizzato in setModuloSede (pattern
 * organizzazione.ts). La RLS resta il confine di sicurezza; qui la si specchia.
 *
 * Stato attuale: un solo modulo attivabile a catalogo ('sicurezza'). Tutta la
 * logica "selettore/badge/filtro" a valle si auto-nasconde con un solo valore.
 */

export interface Modulo {
  id: string;
  codice: string;
  famiglia: "sicurezza" | "haccp";
  nomeCommerciale: string;
  nomeBreve: string; // per badge/filtro (senza il prefisso "SafeCheck ")
  prefissoVerbale: string;
  attivo: boolean;
}
export interface ModuloSede extends Modulo {
  attivoSede: boolean; // moduli_sede.attivo per la sede
}

const COLS = "id, codice, famiglia, nome_commerciale, prefisso_verbale, attivo";
type Row = {
  id: string;
  codice: string;
  famiglia: "sicurezza" | "haccp";
  nome_commerciale: string;
  prefisso_verbale: string;
  attivo: boolean;
};
function mapModulo(r: Row): Modulo {
  return {
    id: r.id,
    codice: r.codice,
    famiglia: r.famiglia,
    nomeCommerciale: r.nome_commerciale,
    nomeBreve: r.nome_commerciale.replace(/^SafeCheck\s+/i, ""),
    prefissoVerbale: r.prefisso_verbale,
    attivo: r.attivo,
  };
}

/** Intero catalogo moduli (RLS: leggibile da ogni utente attivo). */
export async function getModuli(): Promise<Modulo[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("moduli").select(COLS).order("famiglia").order("nome_commerciale");
  return (data ?? []).map((r) => mapModulo(r as Row));
}

/** Moduli ATTIVABILI a catalogo (attivo=true). Oggi solo 'sicurezza'. */
export async function getModuliAttivabili(): Promise<Modulo[]> {
  return (await getModuli()).filter((m) => m.attivo);
}

/** Id del modulo 'sicurezza' (continuità serie SC, default sicuro). */
export async function getModuloSicurezzaId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("moduli").select("id").eq("codice", "sicurezza").single();
  if (!data) throw new Error("Modulo 'sicurezza' non trovato a catalogo.");
  return data.id;
}

/**
 * Moduli attivabili con il loro stato di attivazione sulla sede (per la sezione
 * "Servizi attivi"). Un modulo attivabile senza riga moduli_sede risulta spento.
 */
export async function getModuliSede(sedeId: string): Promise<ModuloSede[]> {
  const supabase = await createClient();
  const attivabili = await getModuliAttivabili();
  const { data: ms } = await supabase
    .from("moduli_sede")
    .select("modulo_id, attivo")
    .eq("sede_id", sedeId);
  const stato = new Map((ms ?? []).map((r) => [r.modulo_id as string, r.attivo as boolean]));
  return attivabili.map((m) => ({ ...m, attivoSede: stato.get(m.id) ?? false }));
}

/**
 * Moduli SELEZIONABILI alla creazione di una visita/piano sulla sede: attivi a
 * catalogo, attivi sulla sede E con almeno un template attivo. Se il risultato è
 * di lunghezza 1, il chiamante NON renderizza il selettore (flusso invariato).
 */
export async function getModuliSelezionabiliVisita(sedeId: string): Promise<Modulo[]> {
  const supabase = await createClient();
  const attivabili = await getModuliAttivabili();
  if (attivabili.length === 0) return [];

  const [{ data: ms }, { data: tmpl }] = await Promise.all([
    supabase.from("moduli_sede").select("modulo_id").eq("sede_id", sedeId).eq("attivo", true),
    supabase.from("template_master").select("modulo_id").eq("attivo", true),
  ]);
  const attiviSede = new Set((ms ?? []).map((r) => r.modulo_id as string));
  const conTemplate = new Set((tmpl ?? []).map((r) => r.modulo_id as string));
  return attivabili.filter((m) => attiviSede.has(m.id) && conTemplate.has(m.id));
}

/**
 * Attiva/disattiva un modulo su una sede. Enforcement: solo admin/planner (il
 * tecnico non può). Verificato qui a livello app; la RLS (028) è il confine reale.
 */
export async function setModuloSede(sedeId: string, moduloId: string, attivo: boolean): Promise<void> {
  if (!(await canManagePlanning())) {
    throw new Error("Non hai i permessi per gestire i servizi della sede.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("moduli_sede")
    .upsert({ sede_id: sedeId, modulo_id: moduloId, attivo }, { onConflict: "sede_id,modulo_id" });
  if (error) throw new Error(`Aggiornamento servizio non riuscito: ${error.message}`);
}
