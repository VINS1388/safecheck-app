"use server";

import { revalidatePath } from "next/cache";
import {
  creaUtente,
  cambiaRuolo,
  impostaAttivo,
  resetPassword,
  contaSlotFuturiTecnico,
  aggiornaAnagraficaUtente,
  dipendenzeUtente,
  eliminaUtenteFisico,
  OrgError,
  type RuoloUtente,
  type DipendenzeUtente,
} from "@/lib/server/organizzazione";
import {
  aggiornaProfiloOrganizzazione,
  type AggiornaProfiloOrgInput,
} from "@/lib/server/org-profilo";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

/** Id dell'attore corrente per l'audit (best-effort, mai bloccante). */
async function attoreId(): Promise<string | null> {
  return (await getCurrentUser()).user?.id ?? null;
}

/**
 * Server actions dell'area /organizzazione. Sottili: delegano al modulo dati
 * unico (`@/lib/server/organizzazione`), che come primo passo verifica che il
 * chiamante sia admin attivo e solo dopo usa il service role. Qui si mappano gli
 * errori tipizzati (OrgError) in messaggi leggibili — mai errori grezzi
 * Supabase/Postgres. Le password temporanee viaggiano solo nel valore di ritorno
 * (mostrate una volta alla UI): mai loggate, mai persistite.
 */

function messaggioErrore(e: unknown): string {
  if (e instanceof OrgError) {
    switch (e.code) {
      case "non_autorizzato":
        return "Non hai i permessi per modificare questo utente.";
      case "email_duplicata":
        return "Esiste già un utente con questa email.";
      case "ultimo_admin":
        return "Deve rimanere almeno un admin attivo.";
      case "non_trovato":
        return "Utente non trovato.";
      case "input_invalido":
        return e.message; // messaggio di validazione specifico e sicuro
    }
  }
  return "Operazione non completata. Riprova o verifica i dati inseriti.";
}

export type CreaUtenteResult =
  | { ok: true; tempPassword: string; nome: string; email: string }
  | { ok: false; error: string };

export async function creaUtenteAction(input: {
  nome: string;
  email: string;
  ruolo: RuoloUtente;
}): Promise<CreaUtenteResult> {
  try {
    const r = await creaUtente(input);
    await logAuditEvent({
      entityType: "utente",
      entityId: r.utente.id,
      eventType: "utente.creato",
      actorUserId: await attoreId(),
      payload: { ruolo: input.ruolo },
    });
    revalidatePath("/organizzazione");
    return { ok: true, tempPassword: r.tempPassword, nome: r.utente.nome_completo, email: r.utente.email };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}

export type AzioneResult = { ok: true } | { ok: false; error: string };

export async function cambiaRuoloAction(
  userId: string,
  nuovoRuolo: RuoloUtente
): Promise<AzioneResult> {
  try {
    await cambiaRuolo(userId, nuovoRuolo);
    await logAuditEvent({
      entityType: "utente",
      entityId: userId,
      eventType: "utente.ruolo_modificato",
      actorUserId: await attoreId(),
      payload: { nuovo_ruolo: nuovoRuolo },
    });
    revalidatePath("/organizzazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}

export async function aggiornaAnagraficaUtenteAction(
  userId: string,
  input: { nome_completo: string; telefono: string | null; qualifica: string | null }
): Promise<AzioneResult> {
  try {
    await aggiornaAnagraficaUtente(userId, input);
    revalidatePath("/organizzazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}

export async function aggiornaProfiloOrganizzazioneAction(
  input: AggiornaProfiloOrgInput
): Promise<AzioneResult> {
  try {
    await aggiornaProfiloOrganizzazione(input);
    revalidatePath("/organizzazione");
    revalidatePath("/profilo");
    return { ok: true };
  } catch (e) {
    // Linguaggio errori unificato (S6): mai un errore grezzo Supabase all'utente.
    return { ok: false, error: messaggioErrore(e) };
  }
}

export async function impostaAttivoAction(
  userId: string,
  attivo: boolean
): Promise<AzioneResult> {
  try {
    await impostaAttivo(userId, attivo);
    await logAuditEvent({
      entityType: "utente",
      entityId: userId,
      eventType: attivo ? "utente.riattivato" : "utente.disattivato",
      actorUserId: await attoreId(),
    });
    revalidatePath("/organizzazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}

export type ResetPasswordResult =
  | { ok: true; tempPassword: string }
  | { ok: false; error: string };

export async function resetPasswordAction(userId: string): Promise<ResetPasswordResult> {
  try {
    const r = await resetPassword(userId);
    // MAI la password nel payload: solo il fatto che il reset è avvenuto.
    await logAuditEvent({
      entityType: "utente",
      entityId: userId,
      eventType: "utente.password_reset",
      actorUserId: await attoreId(),
    });
    return { ok: true, tempPassword: r.tempPassword };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}

export type DipendenzeUtenteResult =
  | { ok: true; dip: DipendenzeUtente }
  | { ok: false; error: string };

/** Dipendenze di un utente, per abilitare/spiegare l'eliminazione fisica in UI. */
export async function dipendenzeUtenteAction(userId: string): Promise<DipendenzeUtenteResult> {
  try {
    const dip = await dipendenzeUtente(userId);
    return { ok: true, dip };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}

/** Eliminazione fisica di un utente pulito (gate in eliminaUtenteFisico via requireAdmin). */
export async function eliminaUtenteFisicoAction(userId: string): Promise<AzioneResult> {
  try {
    await eliminaUtenteFisico(userId);
    await logAuditEvent({
      entityType: "utente",
      entityId: userId,
      eventType: "utente.eliminato_fisico",
      actorUserId: await attoreId(),
    });
    revalidatePath("/organizzazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}

export type ContaSlotResult = { ok: true; count: number } | { ok: false; error: string };

/** Avviso pre-disattivazione: quanti slot futuri sono assegnati a questo tecnico. */
export async function contaSlotFuturiTecnicoAction(userId: string): Promise<ContaSlotResult> {
  try {
    const count = await contaSlotFuturiTecnico(userId);
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}
