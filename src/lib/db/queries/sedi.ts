import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";
import { getModuloSicurezzaId } from "@/lib/db/queries/moduli";

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

  // Ogni sede nasce con il modulo base 'sicurezza' attivo (stato di fatto,
  // coerente col seed della migration 028 per le sedi preesistenti). Senza questa
  // riga il gate server-side can_creare_visita_con_modulo bloccherebbe anche il
  // flusso sicurezza sulle sedi create dopo la 029 (DEFAULT rimosso).
  const sicurezzaId = await getModuloSicurezzaId();
  const { error: errMs } = await supabase
    .from("moduli_sede")
    .insert({ sede_id: data.id, modulo_id: sicurezzaId, attivo: true });
  if (errMs) {
    throw new Error(`Sede creata ma attivazione modulo base non riuscita: ${errMs.message}`);
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

/** Slot di pianificazione FUTURI (stato <> 'eseguita') collegati a una sede. */
export async function contaSlotFuturiSede(sedeId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("visite_pianificate")
    .select("id", { count: "exact", head: true })
    .eq("sede_id", sedeId)
    .neq("stato", "eseguita");
  return count ?? 0;
}

/**
 * Disattiva (soft: `attiva=false`) una sede. Sprint 16.6: SEMPRE consentita e
 * reversibile — non cancella nulla, non è bloccata da visite né dal piano/slot
 * (l'avviso impatti è informativo, mostrato in UI prima della conferma). Il blocco
 * per dipendenze resta sull'eliminazione FISICA (hard-delete), non su questa.
 */
export async function disattivaSede(sedeId: string): Promise<EsitoOperazione> {
  const supabase = await createClient();
  const { error } = await supabase.from("sedi").update({ attiva: false }).eq("id", sedeId);
  if (error) return { ok: false, motivo: `Errore disattivazione sede: ${error.message}` };
  return { ok: true };
}

/** Riattiva una sede precedentemente disattivata (`attiva=true`). */
export async function riattivaSede(sedeId: string): Promise<EsitoOperazione> {
  const supabase = await createClient();
  const { error } = await supabase.from("sedi").update({ attiva: true }).eq("id", sedeId);
  if (error) return { ok: false, motivo: `Errore riattivazione sede: ${error.message}` };
  return { ok: true };
}

// ── Hard-delete sede (Sprint 16.6, STEP 6) ──────────────────────────────────

export interface DipendenzeSede {
  visite: number;
  piani: number;
  slot: number;
  templateSede: number;
  scadenze: number;
  totale: number;
  eliminabile: boolean;
}

/**
 * Conta i riferimenti a una sede. `totale === 0` → eliminabile fisicamente.
 * NON conta `moduli_sede`: è un figlio di CONFIGURAZIONE auto-generato (modulo base),
 * non storico — verrà rimosso esplicitamente in eliminaSedeFisica.
 */
export async function dipendenzeSede(sedeId: string): Promise<DipendenzeSede> {
  const supabase = await createClient();
  const conta = async (tab: string, col: string): Promise<number> => {
    const { count } = await supabase.from(tab).select("id", { count: "exact", head: true }).eq(col, sedeId);
    return count ?? 0;
  };
  const visite = await conta("visite", "sede_id");
  const piani = await conta("piani_visite", "sede_id");
  const slot = await conta("visite_pianificate", "sede_id");
  const templateSede = await conta("template_sede", "sede_id");
  const scadenze = await conta("scadenze", "sede_id");
  const totale = visite + piani + slot + templateSede + scadenze;
  return { visite, piani, slot, templateSede, scadenze, totale, eliminabile: totale === 0 };
}

/**
 * Eliminazione FISICA di una sede (STEP 6). Solo se pulita (zero visite/piani/slot/
 * template/scadenze). Un SINGOLO `DELETE FROM sedi`: atomico. L'unico figlio residuo
 * possibile è `moduli_sede` (config base auto-generata) — il pre-check dipendenze
 * garantisce che tutti gli altri figli-cascade (piani/slot/template) e i figli
 * RESTRICT (visite/scadenze) siano assenti — e viene rimosso dal CASCADE ESISTENTE
 * `moduli_sede → sedi` (migration 028; non è un cascade nuovo). RLS: sedi_delete_admin
 * (is_admin). Ri-verifica le dipendenze PRIMA del delete.
 */
export async function eliminaSedeFisica(sedeId: string): Promise<EsitoOperazione> {
  const dip = await dipendenzeSede(sedeId);
  if (!dip.eliminabile) {
    return {
      ok: false,
      motivo:
        "La sede ha elementi collegati (visite, piani, slot, template o scadenze): non è eliminabile fisicamente. Usa la disattivazione.",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("sedi").delete().eq("id", sedeId);
  if (error) return { ok: false, motivo: `Errore eliminazione sede: ${error.message}` };
  return { ok: true };
}

/** Sedi ARCHIVIATE (attiva=false) di un cliente — vista "Archiviate". */
export async function getSediArchiviate(clienteId: string): Promise<Sede[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sedi")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("attiva", false)
    .order("nome", { ascending: true });
  if (error || !data) return [];
  return data as Sede[];
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
