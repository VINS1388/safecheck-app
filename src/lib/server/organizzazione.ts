import "server-only";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManageUsers } from "@/lib/auth/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { generaPasswordTemporanea } from "./genera-password";
import type { Tables, Enums } from "@/types/database.types";

export { generaPasswordTemporanea };

/**
 * MODULO DATI UNICO per la gestione utenti (area /organizzazione, Sprint 16 —
 * Checkpoint 2). Tutte le query e le mutazioni sugli utenti vivono QUI: è il
 * prerequisito per la migrazione Fase 3 da `utenti.ruolo` a una membership
 * per-organizzazione (cambierà solo l'implementazione di queste funzioni).
 *
 * ENFORCEMENT DI SICUREZZA (non bypassabile): ogni funzione, come PRIMO passo,
 * chiama `requireAdmin()` — verifica dalla sessione server-side che il chiamante
 * sia un admin ATTIVO. Solo DOPO questa verifica si istanzia il service role
 * (`createAdminClient`, necessario per la Admin API di Supabase Auth). Il client
 * non è mai fonte di verità per identità/permessi. Il service role è creato
 * esclusivamente dentro queste funzioni, mai prima del guard.
 *
 * ANTI-LOCKOUT (difesa in profondità): il check applicativo qui sotto rifiuta di
 * disattivare o retrocedere l'ultimo admin attivo (incluso il caso self). È la
 * prima linea; sotto c'è il trigger DB `trg_utenti_anti_lockout` (migration 027,
 * errcode SC001) che serializza e blocca in modo race-safe anche via service role.
 */

export type RuoloUtente = Enums<"ruolo_utente">; // "admin" | "specialist" | "planner"
export type UtenteLista = Pick<
  Tables<"utenti">,
  "id" | "email" | "nome_completo" | "ruolo" | "telefono" | "qualifica" | "attivo" | "creato_il"
>;

const CAMPI_LISTA = "id, email, nome_completo, ruolo, telefono, qualifica, attivo, creato_il";
const RUOLI: readonly RuoloUtente[] = ["admin", "planner", "specialist"];
export function isRuoloValido(x: string): x is RuoloUtente {
  return (RUOLI as readonly string[]).includes(x);
}

export type OrgErrorCode =
  | "non_autorizzato"
  | "email_duplicata"
  | "ultimo_admin"
  | "non_trovato"
  | "input_invalido"
  | "generico";

/** Errore tipizzato: il codice guida la mappatura del messaggio nell'action. */
export class OrgError extends Error {
  code: OrgErrorCode;
  constructor(code: OrgErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "OrgError";
  }
}

/** Verifica che il chiamante sia admin attivo. Ritorna il suo profilo. */
async function requireAdmin() {
  const { user, profilo } = await getCurrentUser();
  if (!user) throw new OrgError("non_autorizzato", "Sessione scaduta.");
  if (!profilo || !profilo.attivo || !(await canManageUsers())) {
    throw new OrgError("non_autorizzato");
  }
  return profilo;
}

// Password temporanea: generata da `./genera-password` (CSPRNG, modulo puro
// unit-testato). Restituita una sola volta, mai loggata/persistita/negli errori.

// ── Helper interni (assumono guard già passato) ─────────────────────────────
type AdminClient = ReturnType<typeof createAdminClient>;

async function getUtenteById(admin: AdminClient, id: string): Promise<UtenteLista> {
  const { data, error } = await admin
    .from("utenti")
    .select(CAMPI_LISTA)
    .eq("id", id)
    .single();
  if (error || !data) throw new OrgError("non_trovato");
  return data as UtenteLista;
}

async function contaAltriAdminAttivi(admin: AdminClient, escludiId: string): Promise<number> {
  const { count, error } = await admin
    .from("utenti")
    .select("id", { count: "exact", head: true })
    .eq("ruolo", "admin")
    .eq("attivo", true)
    .neq("id", escludiId);
  if (error) throw new OrgError("generico", error.message);
  return count ?? 0;
}

// ── Query ────────────────────────────────────────────────────────────────────
export async function listaUtenti(): Promise<UtenteLista[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("utenti")
    .select(CAMPI_LISTA)
    .order("attivo", { ascending: false })
    .order("nome_completo", { ascending: true });
  if (error) throw new OrgError("generico", error.message);
  return (data ?? []) as UtenteLista[];
}

// ── Mutazioni ────────────────────────────────────────────────────────────────

/**
 * Crea un utente: Admin API (email già confermata) + normalizzazione del profilo.
 * Il trigger handle_new_user (004) inserisce la riga utenti dai metadata; qui la
 * si allinea a nome/ruolo/attivo definitivi. Se il passo post-creazione fallisce,
 * l'auth user viene rimosso (cleanup) per non lasciare orfani.
 * Restituisce la password temporanea UNA volta (mai loggata/persistita).
 */
export async function creaUtente(input: {
  nome: string;
  email: string;
  ruolo: RuoloUtente;
}): Promise<{ tempPassword: string; utente: UtenteLista }> {
  await requireAdmin();
  const nome = input.nome.trim();
  const email = input.email.trim().toLowerCase();
  if (!nome) throw new OrgError("input_invalido", "Il nome è obbligatorio.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new OrgError("input_invalido", "L'indirizzo email non è valido.");
  if (!isRuoloValido(input.ruolo))
    throw new OrgError("input_invalido", "Il ruolo selezionato non è valido.");

  const admin = createAdminClient();
  const password = generaPasswordTemporanea();

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome_completo: nome, ruolo: input.ruolo },
  });
  if (cErr || !created?.user) {
    const msg = (cErr?.message ?? "").toLowerCase();
    const status = (cErr as { status?: number } | null)?.status;
    if (status === 422 || /already|registered|exists|duplicate/.test(msg)) {
      throw new OrgError("email_duplicata");
    }
    throw new OrgError("generico", cErr?.message);
  }

  const uid = created.user.id;
  try {
    const { error: uErr } = await admin
      .from("utenti")
      .update({ nome_completo: nome, ruolo: input.ruolo, attivo: true })
      .eq("id", uid);
    if (uErr) throw new OrgError("generico", uErr.message);
    const utente = await getUtenteById(admin, uid);
    return { tempPassword: password, utente };
  } catch (e) {
    // Cleanup: l'auth user esiste ma il profilo non è coerente → rimuovilo.
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    throw e instanceof OrgError ? e : new OrgError("generico");
  }
}

/**
 * Aggiorna i DATI ANAGRAFICI di un utente (admin, Sprint 16.6). Whitelist:
 * `nome_completo`, `telefono`, `qualifica`. NON tocca mai ruolo/attivo (quelli
 * hanno funzioni dedicate con anti-lockout) né email (fuori scope Auth).
 */
export async function aggiornaAnagraficaUtente(
  userId: string,
  input: { nome_completo: string; telefono: string | null; qualifica: string | null }
): Promise<UtenteLista> {
  await requireAdmin();
  const nome = input.nome_completo.trim();
  if (!nome) throw new OrgError("input_invalido", "Il nome è obbligatorio.");
  const admin = createAdminClient();
  await getUtenteById(admin, userId); // 404 se non esiste
  const { error } = await admin
    .from("utenti")
    .update({
      nome_completo: nome,
      telefono: input.telefono?.trim() || null,
      qualifica: input.qualifica?.trim() || null,
    })
    .eq("id", userId);
  if (error) throw new OrgError("generico", error.message);
  return getUtenteById(admin, userId);
}

/** Cambia il ruolo di un utente. Anti-lockout su retrocessione dell'ultimo admin. */
export async function cambiaRuolo(userId: string, nuovoRuolo: RuoloUtente): Promise<UtenteLista> {
  await requireAdmin();
  if (!isRuoloValido(nuovoRuolo))
    throw new OrgError("input_invalido", "Il ruolo selezionato non è valido.");
  const admin = createAdminClient();
  const target = await getUtenteById(admin, userId);

  if (target.ruolo === "admin" && target.attivo && nuovoRuolo !== "admin") {
    if ((await contaAltriAdminAttivi(admin, userId)) === 0) throw new OrgError("ultimo_admin");
  }
  if (target.ruolo === nuovoRuolo) return target; // no-op

  const { error } = await admin.from("utenti").update({ ruolo: nuovoRuolo }).eq("id", userId);
  if (error) {
    if (error.code === "SC001") throw new OrgError("ultimo_admin"); // backstop DB
    throw new OrgError("generico", error.message);
  }
  return { ...target, ruolo: nuovoRuolo };
}

/** Attiva/disattiva un utente. Anti-lockout su disattivazione dell'ultimo admin. */
export async function impostaAttivo(userId: string, attivo: boolean): Promise<UtenteLista> {
  await requireAdmin();
  const admin = createAdminClient();
  const target = await getUtenteById(admin, userId);

  if (!attivo && target.ruolo === "admin" && target.attivo) {
    if ((await contaAltriAdminAttivi(admin, userId)) === 0) throw new OrgError("ultimo_admin");
  }
  if (target.attivo === attivo) return target; // no-op

  const { error } = await admin.from("utenti").update({ attivo }).eq("id", userId);
  if (error) {
    if (error.code === "SC001") throw new OrgError("ultimo_admin"); // backstop DB
    throw new OrgError("generico", error.message);
  }
  return { ...target, attivo };
}

/** Reset password: genera una nuova temporanea e la applica. Restituita una volta. */
export async function resetPassword(userId: string): Promise<{ tempPassword: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  await getUtenteById(admin, userId); // 404 se l'utente non esiste
  const password = generaPasswordTemporanea();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new OrgError("generico", error.message);
  return { tempPassword: password };
}

// ── Hard-delete utente (Sprint 16.6, STEP 6) ────────────────────────────────

export interface DipendenzeUtente {
  visite: number;
  slot: number;
  piani: number;
  verbali: number;
  clientiCreati: number;
  template: number;
  audit: number;
  totale: number;
  eliminabile: boolean;
}

/**
 * Conta TUTTI i riferimenti a un utente (FK dirette e indirette). Se `totale === 0`
 * l'utente è "pulito" → eliminabile fisicamente (account di test/errore). Qualsiasi
 * riferimento — incluso storico/audit — blocca: la via corretta resta la
 * disattivazione. Solo admin (requireAdmin).
 */
export async function dipendenzeUtente(userId: string): Promise<DipendenzeUtente> {
  await requireAdmin();
  const admin = createAdminClient();
  const conta = async (tab: string, col: string): Promise<number> => {
    const { count } = await admin.from(tab).select("id", { count: "exact", head: true }).eq(col, userId);
    return count ?? 0;
  };
  const visite = await conta("visite", "specialist_id");
  const slot = await conta("visite_pianificate", "tecnico_assegnato_id");
  const piani = await conta("piani_visite", "tecnico_assegnato_id");
  const verbali = await conta("verbali_pdf", "generato_da");
  const clientiCreati = await conta("clienti", "creato_da");
  const template =
    (await conta("template_master", "creato_da")) +
    (await conta("template_cliente", "modificato_da")) +
    (await conta("template_sede", "modificato_da")) +
    (await conta("template_audit_log", "utente_id"));
  const audit = await conta("audit_log", "utente_id");
  const totale = visite + slot + piani + verbali + clientiCreati + template + audit;
  return { visite, slot, piani, verbali, clientiCreati, template, audit, totale, eliminabile: totale === 0 };
}

/**
 * Eliminazione FISICA di un utente (STEP 6, perimetro H.1). Solo se pulito
 * (dipendenzeUtente.totale === 0). Guardrail: mai sé stessi, mai l'ultimo admin
 * attivo (app-level + trigger 027 come rete DB sulla cascata auth.users→utenti).
 * Ri-verifica le dipendenze server-side PRIMA del delete (non solo in UI).
 */
export async function eliminaUtenteFisico(userId: string): Promise<void> {
  const chiamante = await requireAdmin();
  if (userId === chiamante.id) throw new OrgError("input_invalido", "Non puoi eliminare il tuo stesso account.");

  const admin = createAdminClient();
  const target = await getUtenteById(admin, userId); // 404 se non esiste
  if (target.ruolo === "admin" && target.attivo) {
    if ((await contaAltriAdminAttivi(admin, userId)) === 0) throw new OrgError("ultimo_admin");
  }

  const dip = await dipendenzeUtente(userId);
  if (!dip.eliminabile) {
    throw new OrgError(
      "input_invalido",
      "L'utente ha dati collegati (visite, verbali, pianificazioni o storico): non è eliminabile fisicamente. Usa la disattivazione."
    );
  }

  // deleteUser cancella auth.users → cascade su public.utenti; il trigger
  // anti-lockout (027) è la rete finale (SC001 se togliesse l'ultimo admin).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    if (/SC001|admin attivo/i.test(error.message)) throw new OrgError("ultimo_admin");
    throw new OrgError("generico", error.message);
  }
}

/**
 * Conteggio degli slot di pianificazione FUTURI (stato <> 'eseguita') assegnati a
 * un tecnico. Usato come avviso non bloccante prima di disattivarlo: la
 * disattivazione è consentita, gli slot restano assegnati a lui (segnalati come
 * "Tecnico disattivato" in pianificazione) e potranno essere riassegnati a mano.
 * Nessuna riassegnazione forzata (decisione Sprint 16 STEP 0).
 */
export async function contaSlotFuturiTecnico(userId: string): Promise<number> {
  await requireAdmin();
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("visite_pianificate")
    .select("id", { count: "exact", head: true })
    .eq("tecnico_assegnato_id", userId)
    .neq("stato", "eseguita");
  if (error) throw new OrgError("generico", error.message);
  return count ?? 0;
}
