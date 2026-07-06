import "server-only";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

/**
 * Modulo dati del PROFILO PERSONALE (self-service, Sprint 16.6). L'utente legge e
 * modifica SOLO i propri dati anagrafici, via client RLS (`id = auth.uid()`):
 * nessun service role. La policy `utenti_update_own` (002) consente l'UPDATE della
 * propria riga; il trigger `trg_utenti_anti_escalation` (025) resta la rete DB —
 * qui non tocchiamo mai ruolo/attivo, quindi non scatta.
 *
 * WHITELIST (unica fonte di verità): SOLO `nome_completo`, `telefono`, `qualifica`.
 * `ruolo`/`attivo` = governance admin; `email`/`id` = fuori scope (Auth). Anche se
 * l'input contenesse altri campi, non vengono mai passati all'UPDATE.
 */

export type ProfiloEsteso = Pick<
  Tables<"utenti">,
  "id" | "email" | "nome_completo" | "ruolo" | "telefono" | "qualifica" | "attivo"
>;

const CAMPI = "id, email, nome_completo, ruolo, telefono, qualifica, attivo";

/** Campi che l'utente può modificare del proprio profilo. Fonte di verità unica. */
export const CAMPI_MODIFICABILI_PROFILO = ["nome_completo", "telefono", "qualifica"] as const;

export type AggiornaProfiloInput = {
  nome_completo: string;
  telefono: string | null;
  qualifica: string | null;
};

/** Profilo esteso dell'utente corrente (o null se non autenticato). */
export async function getProfiloCorrente(): Promise<ProfiloEsteso | null> {
  const { user } = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("utenti").select(CAMPI).eq("id", user.id).single();
  return (data as ProfiloEsteso) ?? null;
}

/**
 * Aggiorna i PROPRI dati anagrafici. Whitelist applicata qui: solo i 3 campi.
 * Non tocca mai ruolo/attivo/email/id.
 */
export async function aggiornaProfiloProprio(input: AggiornaProfiloInput): Promise<void> {
  const { user } = await getCurrentUser();
  if (!user) throw new Error("Sessione scaduta.");

  const nome = input.nome_completo.trim();
  if (!nome) throw new Error("Il nome è obbligatorio.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("utenti")
    .update({
      nome_completo: nome,
      telefono: input.telefono?.trim() || null,
      qualifica: input.qualifica?.trim() || null,
    })
    .eq("id", user.id); // RLS: id = auth.uid(); trigger anti-escalation non scatta (ruolo/attivo invariati)

  if (error) throw new Error(`Aggiornamento profilo non riuscito: ${error.message}`);
}
