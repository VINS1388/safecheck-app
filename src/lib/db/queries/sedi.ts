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
  telefono_referente?: string | null;
}

export interface AggiornaSedeInput {
  nome: string;
  indirizzo: string;
  citta: string;
  cap?: string | null;
  provincia?: string | null;
  referente_sede?: string | null;
  telefono_referente?: string | null;
}

/** Esito di un'operazione che può essere bloccata da vincoli di integrità. */
export type EsitoOperazione = { ok: true } | { ok: false; motivo: string };

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
      telefono_referente: dati.telefono_referente ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Errore creazione sede: ${error?.message ?? "sconosciuto"}`);
  }

  return data.id;
}

/** Aggiorna i dati di una sede operativa. */
export async function aggiornaSede(
  sedeId: string,
  dati: AggiornaSedeInput
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("sedi")
    .update({
      nome: dati.nome,
      indirizzo: dati.indirizzo,
      citta: dati.citta,
      cap: dati.cap ?? null,
      provincia: dati.provincia ?? null,
      referente_sede: dati.referente_sede ?? null,
      telefono_referente: dati.telefono_referente ?? null,
    })
    .eq("id", sedeId);

  if (error) {
    throw new Error(`Errore aggiornamento sede: ${error.message}`);
  }
}

/** Numero di visite collegate a una sede (qualunque stato). */
export async function contaVisiteSede(sedeId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("visite")
    .select("id", { count: "exact", head: true })
    .eq("sede_id", sedeId);
  return count ?? 0;
}

/**
 * Elimina (soft-delete: `attiva=false`) una sede, SOLO se non ha visite
 * collegate — l'integrità storica dei verbali non va mai rotta.
 */
export async function eliminaSede(sedeId: string): Promise<EsitoOperazione> {
  const nVisite = await contaVisiteSede(sedeId);
  if (nVisite > 0) {
    return {
      ok: false,
      motivo: `La sede ha ${nVisite} visit${nVisite === 1 ? "a" : "e"} collegat${
        nVisite === 1 ? "a" : "e"
      }: non può essere eliminata (integrità storica dei verbali).`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sedi")
    .update({ attiva: false })
    .eq("id", sedeId);

  if (error) {
    return { ok: false, motivo: `Errore eliminazione sede: ${error.message}` };
  }
  return { ok: true };
}

/**
 * Imposta una sede come "principale" per il suo cliente, azzerando le altre.
 * L'unicità della sede principale per cliente è garantita qui (lato app).
 */
export async function impostaSedePrincipale(
  clienteId: string,
  sedeId: string
): Promise<void> {
  const supabase = await createClient();

  const { error: errReset } = await supabase
    .from("sedi")
    .update({ principale: false })
    .eq("cliente_id", clienteId)
    .neq("id", sedeId);
  if (errReset) {
    throw new Error(`Errore reset sede principale: ${errReset.message}`);
  }

  const { error } = await supabase
    .from("sedi")
    .update({ principale: true })
    .eq("id", sedeId);
  if (error) {
    throw new Error(`Errore impostazione sede principale: ${error.message}`);
  }
}

/** Una sede risolta per id (qualunque stato attiva). Null se inesistente. */
export async function getSedeById(sedeId: string): Promise<Sede | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sedi")
    .select("*")
    .eq("id", sedeId)
    .single();
  if (error || !data) return null;
  return data as Sede;
}

/** Sedi attive di un cliente: la principale per prima, poi per nome. */
export async function getSediByCliente(clienteId: string): Promise<Sede[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sedi")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("attiva", true)
    .order("principale", { ascending: false })
    .order("nome", { ascending: true });

  if (error || !data) return [];
  return data as Sede[];
}
