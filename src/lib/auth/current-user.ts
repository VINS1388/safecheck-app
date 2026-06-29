import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type ProfiloUtente = Pick<
  Tables<"utenti">,
  "id" | "email" | "nome_completo" | "ruolo"
>;

/**
 * Restituisce l'utente autenticato e il relativo profilo dalla tabella utenti.
 * `user` è null se non autenticato; `profilo` è null se manca la riga.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profilo: null as ProfiloUtente | null };
  }

  const { data: profilo } = await supabase
    .from("utenti")
    .select("id, email, nome_completo, ruolo")
    .eq("id", user.id)
    .single();

  return { user, profilo: (profilo as ProfiloUtente) ?? null };
}
