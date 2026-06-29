import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";
import type { Sede } from "./sedi";

export type Cliente = Tables<"clienti">;

/** Riga sintetica per la lista clienti. */
export interface ClienteRiepilogo {
  id: string;
  ragione_sociale: string;
  citta: string | null;
  n_sedi: number;
}

/** Cliente con le sue sedi, per la scheda di dettaglio. */
export interface ClienteConSedi extends Cliente {
  sedi: Sede[];
}

export interface CreaClienteInput {
  ragione_sociale: string;
  citta: string;
  provincia: string;
  partita_iva?: string | null;
  indirizzo_sede_legale?: string | null;
  referente_principale?: string | null;
  email_referente?: string | null;
}

/** Lista clienti attivi con il numero di sedi, ordinati per ragione sociale. */
export async function getClienti(): Promise<ClienteRiepilogo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clienti")
    .select("id, ragione_sociale, citta, sedi(count)")
    .eq("attivo", true)
    .order("ragione_sociale", { ascending: true });

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    ragione_sociale: string;
    citta: string | null;
    sedi: { count: number }[] | null;
  }>).map((c) => ({
    id: c.id,
    ragione_sociale: c.ragione_sociale,
    citta: c.citta,
    n_sedi: c.sedi?.[0]?.count ?? 0,
  }));
}

/** Cliente con le sedi attive risolte. Null se inesistente o non accessibile. */
export async function getClienteById(id: string): Promise<ClienteConSedi | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clienti")
    .select("*, sedi(*)")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const cliente = data as unknown as ClienteConSedi;
  const sedi = (cliente.sedi ?? [])
    .filter((s) => s.attiva)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { ...cliente, sedi };
}

/** Inserisce un nuovo cliente. Ritorna l'id creato. */
export async function creaCliente(dati: CreaClienteInput): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clienti")
    .insert({
      ragione_sociale: dati.ragione_sociale,
      citta: dati.citta,
      provincia: dati.provincia,
      partita_iva: dati.partita_iva ?? null,
      indirizzo_sede_legale: dati.indirizzo_sede_legale ?? null,
      referente_principale: dati.referente_principale ?? null,
      email_referente: dati.email_referente ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Errore creazione cliente: ${error?.message ?? "sconosciuto"}`);
  }

  return data.id;
}
