import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManageOrganizzazione } from "@/lib/auth/rbac";

/**
 * Modulo dati del PROFILO ORGANIZZAZIONE (singleton, migration 031). LETTURA aperta
 * a tutti gli autenticati attivi (policy org_select_attivi); SCRITTURA solo admin
 * (gate app canManageOrganizzazione + policy org_update_admin). Nessun create/delete
 * (singleton enforced a DB). Il client Supabase del progetto è untyped: si usa
 * un'interfaccia locale + cast, come in moduli.ts.
 */

export interface ProfiloOrganizzazione {
  id: string;
  ragione_sociale: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  email: string | null;
  telefono: string | null;
  logo_url: string | null;
}

const CAMPI =
  "id, ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta, cap, provincia, email, telefono, logo_url";

/** Campi modificabili del profilo org (fonte di verità unica; esclude logo_url = upload futuro). */
export type AggiornaProfiloOrgInput = {
  ragione_sociale: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  email: string | null;
  telefono: string | null;
};

/** Profilo organizzazione (unica riga). Null se non ancora seedato. */
export async function getProfiloOrganizzazione(): Promise<ProfiloOrganizzazione | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("organizzazione").select(CAMPI).limit(1).maybeSingle();
  return (data as ProfiloOrganizzazione) ?? null;
}

/** Aggiorna il profilo org (unica riga). Solo admin; whitelist campi anagrafici. */
export async function aggiornaProfiloOrganizzazione(input: AggiornaProfiloOrgInput): Promise<void> {
  const { user } = await getCurrentUser();
  if (!user) throw new Error("Sessione scaduta.");
  if (!(await canManageOrganizzazione())) throw new Error("Non hai i permessi per modificare l'organizzazione.");

  const ragione = input.ragione_sociale.trim();
  if (!ragione) throw new Error("La ragione sociale è obbligatoria.");

  const norm = (v: string | null) => v?.trim() || null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizzazione")
    .update({
      ragione_sociale: ragione,
      partita_iva: norm(input.partita_iva),
      codice_fiscale: norm(input.codice_fiscale),
      indirizzo: norm(input.indirizzo),
      citta: norm(input.citta),
      cap: norm(input.cap),
      provincia: norm(input.provincia),
      email: norm(input.email),
      telefono: norm(input.telefono),
    })
    .eq("singleton", true); // targeting dell'unica riga (RLS org_update_admin)

  if (error) throw new Error(`Aggiornamento organizzazione non riuscito: ${error.message}`);
}
