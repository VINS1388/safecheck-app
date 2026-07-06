"use server";

import { revalidatePath } from "next/cache";
import {
  creaUtente,
  cambiaRuolo,
  impostaAttivo,
  resetPassword,
  contaSlotFuturiTecnico,
  OrgError,
  type RuoloUtente,
} from "@/lib/server/organizzazione";

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
    revalidatePath("/organizzazione");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messaggioErrore(e) };
  }
}

export async function impostaAttivoAction(
  userId: string,
  attivo: boolean
): Promise<AzioneResult> {
  try {
    await impostaAttivo(userId, attivo);
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
    return { ok: true, tempPassword: r.tempPassword };
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
