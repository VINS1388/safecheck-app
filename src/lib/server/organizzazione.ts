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
  "id" | "email" | "nome_completo" | "ruolo" | "attivo" | "creato_il"
>;

const CAMPI_LISTA = "id, email, nome_completo, ruolo, attivo, creato_il";
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
