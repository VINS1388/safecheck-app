import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "./current-user";

/**
 * Ambito di visibilità dati dell'utente corrente (Sprint 16). È il mirror
 * APPLICATIVO (UX + performance) della regola di visibilità che la RLS
 * (migration 025) applicherà come confine di sicurezza. NON sostituisce la RLS:
 * serve a non caricare righe che la RLS scarterebbe e a evitare viste vuote.
 *
 *  - admin / planner  → { mode: 'all' } (vedono l'intero portafoglio)
 *  - specialist       → { mode: 'tecnico' } con l'UNIONE raggiungibile:
 *       sedi/clienti toccati da una visita propria o da uno slot assegnato
 *  - non autenticato / disattivato → { mode: 'none' }
 */
export type ScopeVisibilita =
  | { mode: "all" }
  | { mode: "none" }
  | {
      mode: "tecnico";
      userId: string;
      sedeIds: Set<string>;
      clienteIds: Set<string>;
      visitaIds: Set<string>;
    };

export const getScopeVisibilita = cache(async function getScopeVisibilita(): Promise<ScopeVisibilita> {
  const p = await getCurrentUserProfile();
  if (!p || !p.attivo) return { mode: "none" };
  if (p.ruolo === "admin" || p.ruolo === "planner") return { mode: "all" };

  // specialist/tecnico: calcola l'unione raggiungibile.
  const supabase = await createClient();
  const userId = p.id;

  const [{ data: visite }, { data: slot }] = await Promise.all([
    supabase.from("visite").select("id, sede_id, cliente_id").eq("specialist_id", userId),
    supabase.from("visite_pianificate").select("sede_id").eq("tecnico_assegnato_id", userId),
  ]);

  const sedeIds = new Set<string>();
  const clienteIds = new Set<string>();
  const visitaIds = new Set<string>();
  for (const v of visite ?? []) {
    if (v.id) visitaIds.add(v.id);
    if (v.sede_id) sedeIds.add(v.sede_id);
    if (v.cliente_id) clienteIds.add(v.cliente_id);
  }
  for (const s of slot ?? []) {
    if (s.sede_id) sedeIds.add(s.sede_id);
  }

  // I clienti delle sedi raggiungibili via slot (le visite danno già cliente_id).
  if (sedeIds.size > 0) {
    const { data: sedi } = await supabase
      .from("sedi")
      .select("id, cliente_id")
      .in("id", Array.from(sedeIds));
    for (const s of sedi ?? []) {
      if (s.cliente_id) clienteIds.add(s.cliente_id);
    }
  }

  return { mode: "tecnico", userId, sedeIds, clienteIds, visitaIds };
});
