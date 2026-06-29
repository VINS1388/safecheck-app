import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type Sede = Tables<"sedi">;

export interface CreaSedeInput {
  cliente_id: string;
  nome: string;
  indirizzo: string;
  citta: string;
  cap?: string | null;
  provincia?: string | null;
  referente_sede?: string | null;
}

/** Inserisce una sede per il cliente indicato. Ritorna l'id creato. */
export async function creaSede(dati: CreaSedeInput): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sedi")
    .insert({
      cliente_id: dati.cliente_id,
      nome: dati.nome,
      indirizzo: dati.indirizzo,
      citta: dati.citta,
      cap: dati.cap ?? null,
      provincia: dati.provincia ?? null,
      referente_sede: dati.referente_sede ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Errore creazione sede: ${error?.message ?? "sconosciuto"}`);
  }

  return data.id;
}

/** Sedi attive di un cliente, ordinate per nome. */
export async function getSediByCliente(clienteId: string): Promise<Sede[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sedi")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("attiva", true)
    .order("nome", { ascending: true });

  if (error || !data) return [];
  return data as Sede[];
}
