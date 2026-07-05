import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManagePlanning } from "@/lib/auth/rbac";

/**
 * Provider delle opzioni per la FilterBar (Sprint 16.5).
 *
 * - Clienti/sedi: via client RLS → già scopate per ruolo (lo specialist vede solo
 *   ciò che gli è raggiungibile), così i menu non mostrano dimensioni non pertinenti.
 * - Tecnici: la RLS su `utenti` è own_or_admin → un planner non leggerebbe il
 *   roster. Il filtro "Tecnico" è comunque riservato ad admin/planner: qui si
 *   verifica `canManagePlanning()` e SOLO dopo si usa il service role per leggere
 *   il roster (pattern verify→service-role di organizzazione). Nessuna migration.
 */

export interface Opzione {
  value: string;
  label: string;
}
export interface OpzioneSede extends Opzione {
  clienteId: string;
}

export async function getClientiOpzioni(): Promise<Opzione[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clienti")
    .select("id, ragione_sociale")
    .order("ragione_sociale", { ascending: true });
  return (data ?? []).map((c) => ({ value: c.id, label: c.ragione_sociale }));
}

export async function getSediOpzioni(): Promise<OpzioneSede[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sedi")
    .select("id, nome, cliente_id")
    .eq("attiva", true)
    .order("nome", { ascending: true });
  return (data ?? []).map((s) => ({ value: s.id, label: s.nome, clienteId: s.cliente_id }));
}

/** Roster tecnici (admin+specialist attivi). Vuoto se il chiamante non è admin/planner. */
export async function getTecniciOpzioni(): Promise<Opzione[]> {
  if (!(await canManagePlanning())) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("utenti")
    .select("id, nome_completo, ruolo")
    .eq("attivo", true)
    .in("ruolo", ["admin", "specialist"])
    .order("nome_completo", { ascending: true });
  return (data ?? []).map((u) => ({ value: u.id, label: u.nome_completo }));
}
