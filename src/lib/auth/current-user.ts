import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type ProfiloUtente = Pick<
  Tables<"utenti">,
  "id" | "email" | "nome_completo" | "ruolo" | "attivo"
>;

/**
 * Restituisce l'utente autenticato e il relativo profilo dalla tabella utenti.
 * `user` è null se non autenticato; `profilo` è null se manca la riga.
 *
 * Memoizzato per-request con React.cache: layout, pagine e action che lo
 * richiamano nello stesso render condividono un unico round-trip (auth + DB).
 * Include `attivo` (Sprint 16): un utente disattivato va trattato come accesso
 * negato dal gate del layout e dagli helper RBAC.
 */
export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profilo: null as ProfiloUtente | null };
  }

  const { data: profilo } = await supabase
    .from("utenti")
    .select("id, email, nome_completo, ruolo, attivo")
    .eq("id", user.id)
    .single();

  return { user, profilo: (profilo as ProfiloUtente) ?? null };
});

/** Solo il profilo dell'utente corrente (o null). Convenience su getCurrentUser. */
export async function getCurrentUserProfile(): Promise<ProfiloUtente | null> {
  return (await getCurrentUser()).profilo;
}
