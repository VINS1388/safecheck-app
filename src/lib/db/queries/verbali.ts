import { createClient } from "@/lib/supabase/server";

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
