import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables, Enums } from "@/types/database.types";
import { generaPasswordTemporanea } from "./genera-password";

/**
 * CORE della gestione utenti — business logic PURA, senza dipendenze Next
 * (NESSUN `import "server-only"`, nessun `getCurrentUser`/`requireAdmin`, nessun
 * `createAdminClient`). Le funzioni ricevono un client service-role (`admin`) e un
 * `chiamanteId` GIÀ verificato dal chiamante: qui NON si autentica e NON si
 * autorizza. L'unico entry point pubblico resta `organizzazione.ts` (server-only),
 * che fa `requireAdmin()` e delega a queste funzioni.
 *
 * Perché esiste (Sprint 19.B): rendere il dual-write `utenti` ↔
 * `organizzazione_membri` esercitabile da uno script Node reale
 * (`scripts/test-19b-dual-write.mjs`) importando IL CODICE VERO — impossibile se
 * fosse dietro `server-only` (che dipende dal contesto di request Next).
 *
 * DUAL-WRITE (multi-tenancy): ogni mutazione di `utenti.ruolo/attivo` allinea la
 * riga corrispondente in `organizzazione_membri`. Su disallineamento (0 o 2+ righe
 * interessate, o errore) le funzioni lanciano `OrgError("membership_disallineata")`
 * e NON loggano (la tracciabilità audit, Next-specifica, è nel wrapper). Nessuna
 * RLS è toccata e `current_org_id()`/`can_write_visita()` NON sono usate qui
 * (arrivano in 19.C): il service role bypassa la RLS e non ha contesto JWT utente.
 */

export type RuoloUtente = Enums<"ruolo_utente">; // "admin" | "specialist" | "planner"
export type UtenteLista = Pick<
  Tables<"utenti">,
  "id" | "email" | "nome_completo" | "ruolo" | "telefono" | "qualifica" | "attivo" | "creato_il"
>;

export const CAMPI_LISTA =
  "id, email, nome_completo, ruolo, telefono, qualifica, attivo, creato_il";
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
  | "membership_disallineata"
  | "generico";

/**
 * Errore tipizzato: il codice guida la mappatura del messaggio nell'action.
 * `entityId` (opzionale) trasporta l'id utente coinvolto in un errore
 * `membership_disallineata`, così il wrapper può registrarlo nell'audit anche
 * quando (creaUtente) non dispone dell'id per altra via.
 */
export class OrgError extends Error {
  code: OrgErrorCode;
  entityId?: string;
  constructor(code: OrgErrorCode, message?: string, entityId?: string) {
    super(message ?? code);
    this.code = code;
    this.entityId = entityId;
    this.name = "OrgError";
  }
}

// Client service-role NON tipizzato con lo schema `Database` (come
// `createAdminClient()`): `.from(...)` accetta qualsiasi tabella e ritorna `any`,
// il che è necessario per le tabelle non ancora nei tipi generati
// (`organizzazione_membri`). Definito qui SENZA importare `admin.ts` per non
// trascinare `server-only` in questo modulo.
export type AdminClient = SupabaseClient;

// ── Helper interni (assumono guard già passato dal chiamante) ────────────────

export async function getUtenteById(admin: AdminClient, id: string): Promise<UtenteLista> {
  const { data, error } = await admin
    .from("utenti")
    .select(CAMPI_LISTA)
    .eq("id", id)
    .single();
  if (error || !data) throw new OrgError("non_trovato");
  return data as UtenteLista;
}

export async function contaAltriAdminAttivi(admin: AdminClient, escludiId: string): Promise<number> {
  const { count, error } = await admin
    .from("utenti")
    .select("id", { count: "exact", head: true })
    .eq("ruolo", "admin")
    .eq("attivo", true)
    .neq("id", escludiId);
  if (error) throw new OrgError("generico", error.message);
  return count ?? 0;
}

/**
 * Risolve l'organizzazione del chiamante (admin) leggendo direttamente
 * `organizzazione_membri` via service role (RLS bypassata; nessun contesto JWT
 * utente disponibile qui, quindi `current_org_id()` non è usabile). FAIL-CLOSED:
 * esattamente UNA membership attiva, altrimenti errore — nessun default
 * silenzioso (stessa filosofia di `current_org_id()`, ma senza invocarla).
 */
export async function orgIdChiamante(admin: AdminClient, chiamanteId: string): Promise<string> {
  const { data, error } = await admin
    .from("organizzazione_membri")
    .select("organization_id")
    .eq("user_id", chiamanteId)
    .eq("stato", "attivo");
  if (error || !data || data.length !== 1) {
    throw new OrgError(
      "generico",
      "Impossibile determinare l'organizzazione dell'amministratore chiamante."
    );
  }
  return data[0].organization_id as string;
}

/**
 * Dual-write: allinea UNA colonna di `organizzazione_membri` DOPO una mutazione
 * già riuscita su `utenti` (ruolo o stato). Deve toccare ESATTAMENTE 1 riga; ogni
 * disallineamento (0/2+ righe o errore) → `OrgError("membership_disallineata")`.
 * Nessun log qui: lo esegue il wrapper server-only.
 */
async function allineaMembership(
  admin: AdminClient,
  userId: string,
  patch: { ruolo: RuoloUtente } | { stato: "attivo" | "sospeso" }
): Promise<void> {
  const { data, error } = await admin
    .from("organizzazione_membri")
    .update(patch)
    .eq("user_id", userId)
    .select("id");
  if (error || !data || data.length !== 1) {
    throw new OrgError(
      "membership_disallineata",
      error?.message ?? `Allineamento membership non riuscito (righe: ${data?.length ?? 0}).`,
      userId
    );
  }
}

// ── Mutazioni (core) ─────────────────────────────────────────────────────────

/**
 * Crea un utente: Admin API (email già confermata) + normalizzazione profilo +
 * inserimento della membership nell'org del chiamante (dual-write). Se un passo
 * post-creazione fallisce, l'auth user viene rimosso (cleanup) per non lasciare
 * orfani; il cascade FK rimuove anche l'eventuale membership. Restituisce la
 * password temporanea UNA volta (mai loggata/persistita).
 */
export async function creaUtenteCore(
  admin: AdminClient,
  chiamanteId: string,
  input: { nome: string; email: string; ruolo: RuoloUtente }
): Promise<{ tempPassword: string; utente: UtenteLista }> {
  const nome = input.nome.trim();
  const email = input.email.trim().toLowerCase();
  if (!nome) throw new OrgError("input_invalido", "Il nome è obbligatorio.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new OrgError("input_invalido", "L'indirizzo email non è valido.");
  if (!isRuoloValido(input.ruolo))
    throw new OrgError("input_invalido", "Il ruolo selezionato non è valido.");

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

    // Dual-write: la membership vive nell'org del chiamante (fail-closed).
    const orgId = await orgIdChiamante(admin, chiamanteId);
    const { error: mErr, data: mData } = await admin
      .from("organizzazione_membri")
      .insert({ organization_id: orgId, user_id: uid, ruolo: input.ruolo, stato: "attivo" })
      .select("id");
    if (mErr || !mData || mData.length !== 1)
      throw new OrgError(
        "membership_disallineata",
        mErr?.message ?? "Creazione membership fallita.",
        uid
      );

    const utente = await getUtenteById(admin, uid);
    return { tempPassword: password, utente };
  } catch (e) {
    // Cleanup: l'auth user esiste ma lo stato non è coerente → rimuovilo
    // (cascade FK su utenti e organizzazione_membri).
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    throw e instanceof OrgError ? e : new OrgError("generico");
  }
}

/** Cambia il ruolo di un utente. Anti-lockout su retrocessione dell'ultimo admin. */
export async function cambiaRuoloCore(
  admin: AdminClient,
  userId: string,
  nuovoRuolo: RuoloUtente
): Promise<UtenteLista> {
  if (!isRuoloValido(nuovoRuolo))
    throw new OrgError("input_invalido", "Il ruolo selezionato non è valido.");
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
  await allineaMembership(admin, userId, { ruolo: nuovoRuolo });
  return { ...target, ruolo: nuovoRuolo };
}

/** Attiva/disattiva un utente. Anti-lockout su disattivazione dell'ultimo admin. */
export async function impostaAttivoCore(
  admin: AdminClient,
  userId: string,
  attivo: boolean
): Promise<UtenteLista> {
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
  await allineaMembership(admin, userId, { stato: attivo ? "attivo" : "sospeso" });
  return { ...target, attivo };
}
