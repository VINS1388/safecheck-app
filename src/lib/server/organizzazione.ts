import "server-only";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManageUsers } from "@/lib/auth/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import { generaPasswordTemporanea } from "./genera-password";
import {
  OrgError,
  CAMPI_LISTA,
  getUtenteById,
  contaAltriAdminAttivi,
  creaUtenteCore,
  cambiaRuoloCore,
  impostaAttivoCore,
  type RuoloUtente,
  type UtenteLista,
} from "./organizzazione-core";

/**
 * MODULO DATI UNICO per la gestione utenti (area /organizzazione, Sprint 16 —
 * Checkpoint 2) e UNICO ENTRY POINT PUBBLICO. La business logic pura vive in
 * `./organizzazione-core` (senza `server-only`, testabile da script Node);
 * QUI restano l'autenticazione, il service role e la tracciabilità audit.
 *
 * ENFORCEMENT DI SICUREZZA (non bypassabile): ogni funzione, come PRIMO passo,
 * chiama `requireAdmin()` — verifica dalla sessione server-side che il chiamante
 * sia un admin ATTIVO. Solo DOPO questa verifica si istanzia il service role
 * (`createAdminClient`, necessario per la Admin API di Supabase Auth) e si delega
 * al Core. Il client non è mai fonte di verità per identità/permessi.
 *
 * ANTI-LOCKOUT (difesa in profondità): il check applicativo (nel Core) rifiuta di
 * disattivare o retrocedere l'ultimo admin attivo (incluso il caso self). È la
 * prima linea; sotto c'è il trigger DB `trg_utenti_anti_lockout` (migration 027,
 * errcode SC001) che serializza e blocca in modo race-safe anche via service role.
 *
 * DUAL-WRITE (Sprint 19.B): `creaUtente`/`cambiaRuolo`/`impostaAttivo` allineano
 * `organizzazione_membri` a `utenti.ruolo/attivo` (nel Core). Un disallineamento
 * emerge come `OrgError("membership_disallineata")`: qui lo si registra in audit
 * (best-effort, non bloccante) e lo si ri-mappa a `OrgError("generico")`, così il
 * contratto d'errore verso le action non cambia. Nessuna RLS è toccata.
 */

// Re-export della superficie pubblica migrata nel Core (import esterni esistenti:
// actions.ts, page.tsx, OrganizzazioneClient.tsx) + password temporanea.
export { generaPasswordTemporanea };
export { isRuoloValido } from "./organizzazione-core";
export { OrgError };
export type { RuoloUtente, UtenteLista };
export type { OrgErrorCode } from "./organizzazione-core";

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

// ── Mutazioni (wrapper: guard + service role + delega al Core + audit) ────────

/**
 * Best-effort audit di un fallimento di dual-write membership, poi ri-mappa
 * `membership_disallineata` → `generico`. Gli altri OrgError si propagano
 * invariati. `logAuditEvent` è già non bloccante (ingoia i propri errori).
 */
async function rimappaDisallineamento(
  e: unknown,
  actorUserId: string,
  operazione: string,
  fallbackEntityId: string,
  messaggioUtente: string,
  payloadExtra: Record<string, unknown> = {}
): Promise<never> {
  if (e instanceof OrgError && e.code === "membership_disallineata") {
    await logAuditEvent({
      entityType: "utente",
      entityId: e.entityId ?? fallbackEntityId,
      eventType: "organizzazione_membri_dual_write_fallito",
      actorUserId,
      payload: { operazione, messaggio: e.message, ...payloadExtra },
    });
    throw new OrgError("generico", messaggioUtente);
  }
  throw e;
}

/**
 * Crea un utente (Admin API + profilo + membership). Restituisce la password
 * temporanea UNA volta (mai loggata/persistita).
 */
export async function creaUtente(input: {
  nome: string;
  email: string;
  ruolo: RuoloUtente;
}): Promise<{ tempPassword: string; utente: UtenteLista }> {
  const chiamante = await requireAdmin();
  const admin = createAdminClient();
  try {
    return await creaUtenteCore(admin, chiamante.id, input);
  } catch (e) {
    return await rimappaDisallineamento(
      e,
      chiamante.id,
      "creaUtente",
      chiamante.id,
      "Creazione utente non riuscita (allineamento organizzazione).",
      { ruolo: input.ruolo }
    );
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

/** Cambia il ruolo di un utente. Anti-lockout + dual-write membership nel Core. */
export async function cambiaRuolo(userId: string, nuovoRuolo: RuoloUtente): Promise<UtenteLista> {
  const chiamante = await requireAdmin();
  const admin = createAdminClient();
  try {
    return await cambiaRuoloCore(admin, userId, nuovoRuolo);
  } catch (e) {
    return await rimappaDisallineamento(
      e,
      chiamante.id,
      "cambiaRuolo",
      userId,
      "Ruolo aggiornato sull'utente ma non sull'organizzazione: contatta il supporto.",
      { nuovoRuolo }
    );
  }
}

/** Attiva/disattiva un utente. Anti-lockout + dual-write membership nel Core. */
export async function impostaAttivo(userId: string, attivo: boolean): Promise<UtenteLista> {
  const chiamante = await requireAdmin();
  const admin = createAdminClient();
  try {
    return await impostaAttivoCore(admin, userId, attivo);
  } catch (e) {
    return await rimappaDisallineamento(
      e,
      chiamante.id,
      "impostaAttivo",
      userId,
      "Stato aggiornato sull'utente ma non sull'organizzazione: contatta il supporto.",
      { attivo }
    );
  }
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
 * La membership in `organizzazione_membri` sparisce via FK ON DELETE CASCADE.
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
