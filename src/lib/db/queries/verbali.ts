import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET_VERBALI = "verbali";

export interface VerbalePdfRecord {
  storage_path: string;
  sha256_hash: string;
  numero_versione: number;
}

/**
 * Record verbale PDF (versione più recente) per una visita.
 * Usa il client utente: la RLS garantisce l'accesso solo al proprietario.
 */
export async function getVerbalePdfByVisita(
  visitaId: string
): Promise<VerbalePdfRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verbali_pdf")
    .select("storage_path, sha256_hash, numero_versione")
    .eq("visita_id", visitaId)
    .order("numero_versione", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as VerbalePdfRecord;
}

/**
 * Calcola il prossimo numero verbale nel formato SC-YYYY-NNNN per l'anno dato.
 * Usa il client service-role per leggere il MAX globale (oltre la RLS del
 * chiamante) e garantire numerazione progressiva corretta.
 *
 * NOTA: la numerazione atomica "vera" è demandata alla funzione DB
 * `assegna_numero_verbale` (migration 005, formato SC-). Finché la 005 non è
 * applicata, questo helper la sostituisce; il vincolo UNIQUE(numero_verbale)
 * resta la rete di sicurezza contro collisioni concorrenti.
 */
export async function prossimoNumeroVerbale(anno: number): Promise<string> {
  const admin = createAdminClient();
  const prefisso = `SC-${anno}-`;

  const { data, error } = await admin
    .from("visite")
    .select("numero_verbale")
    .like("numero_verbale", `${prefisso}%`)
    .order("numero_verbale", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Errore lettura numerazione verbali: ${error.message}`);
  }

  let prossimo = 1;
  const ultimo = data?.[0]?.numero_verbale as string | undefined;
  if (ultimo) {
    const n = parseInt(ultimo.split("-")[2] ?? "0", 10);
    if (Number.isFinite(n)) prossimo = n + 1;
  }

  return `${prefisso}${String(prossimo).padStart(4, "0")}`;
}
