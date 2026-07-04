import "server-only";
import { getCurrentUserProfile } from "./current-user";
import { getScopeVisibilita } from "./scope";

/**
 * Helper RBAC centralizzati (Sprint 16). TUTTE le verifiche di ruolo/permesso
 * passano da qui: in Fase 3 il ruolo migrerà su una membership utente↔org e
 * cambierà solo l'implementazione di questi helper, non le loro chiamate.
 *
 * Regole bloccate (Sprint 16):
 *  - admin: tutto + gestione utenti
 *  - planner: tutto l'operativo (clienti/sedi/piani/slot/assegnazioni), NO gestione
 *    utenti, NO chiusura/eliminazione di verbali altrui (supervisione = sola lettura)
 *  - specialist/tecnico: solo ciò che gli è assegnato; elimina solo bozze proprie
 *  - un utente `attivo=false` non ha alcun ruolo/permesso (accesso negato)
 */

export type Ruolo = "admin" | "planner" | "specialist";

/** Ruolo effettivo dell'utente attivo, o null se non autenticato/disattivato. */
async function ruoloEffettivo(): Promise<Ruolo | null> {
  const p = await getCurrentUserProfile();
  if (!p || !p.attivo) return null; // disattivato ⇒ nessun ruolo
  return p.ruolo as Ruolo;
}

export async function isAdmin(): Promise<boolean> {
  return (await ruoloEffettivo()) === "admin";
}

export async function isPlanner(): Promise<boolean> {
  return (await ruoloEffettivo()) === "planner";
}

export async function isSpecialist(): Promise<boolean> {
  return (await ruoloEffettivo()) === "specialist";
}

/** Gestione utenti (area /organizzazione): solo admin. */
export async function canManageUsers(): Promise<boolean> {
  return (await ruoloEffettivo()) === "admin";
}

/**
 * Governo dell'operativo: clienti, sedi, piani, slot, assegnazioni tecnico,
 * generazione cicli. admin o planner. NON copre la chiusura verbali (resta al
 * compilatore + admin) né l'eliminazione di bozze altrui.
 */
export async function canManagePlanning(): Promise<boolean> {
  const r = await ruoloEffettivo();
  return r === "admin" || r === "planner";
}

/**
 * Eliminazione bozza (Q2): il chiamante può eliminare la visita SOLO se è una
 * bozza (numero_verbale IS NULL) ed è propria, oppure se è admin. Il planner NON
 * elimina bozze altrui. Mirror applicativo della policy DELETE own_or_admin
 * (migration 023) + del gate "solo bozze" di eliminaVisitaBozza.
 */
export async function canDeleteDraft(v: {
  specialist_id: string;
  numero_verbale: string | null;
}): Promise<boolean> {
  const p = await getCurrentUserProfile();
  if (!p || !p.attivo) return false;
  if (v.numero_verbale != null) return false; // non è una bozza
  return v.specialist_id === p.id || p.ruolo === "admin";
}

/**
 * Accesso in LETTURA a un cliente. admin/planner: sempre. tecnico: solo se il
 * cliente è raggiungibile (una sua visita o uno slot assegnato). Mirror
 * applicativo della futura policy SELECT su clienti (migration 025).
 */
export async function canAccessCliente(clienteId: string): Promise<boolean> {
  const scope = await getScopeVisibilita();
  if (scope.mode === "none") return false;
  if (scope.mode === "all") return true;
  return scope.clienteIds.has(clienteId);
}

/** Accesso in LETTURA a una sede (stessa logica di canAccessCliente). */
export async function canAccessSede(sedeId: string): Promise<boolean> {
  const scope = await getScopeVisibilita();
  if (scope.mode === "none") return false;
  if (scope.mode === "all") return true;
  return scope.sedeIds.has(sedeId);
}

/**
 * Accesso in LETTURA a una visita. admin/planner: sempre. tecnico: se è propria
 * o è collegata a uno slot assegnato. NB: è accesso in lettura — le mutazioni
 * (chiusura, eliminazione) hanno gate propri e restano own_or_admin.
 */
export async function canAccessVisita(v: {
  specialist_id: string;
  sede_id: string;
}): Promise<boolean> {
  const scope = await getScopeVisibilita();
  if (scope.mode === "none") return false;
  if (scope.mode === "all") return true;
  return v.specialist_id === scope.userId || scope.sedeIds.has(v.sede_id);
}
