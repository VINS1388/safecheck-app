import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase con service role key — SOLO server-side.
 * Bypassa la RLS: usarlo unicamente dopo aver validato l'utente e i permessi
 * (es. storage su bucket privato, numerazione globale verbali).
 * La chiave non è mai esposta al client (non è NEXT_PUBLIC).
 */
export function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Config Supabase service role mancante (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
