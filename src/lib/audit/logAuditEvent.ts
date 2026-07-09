import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * TRACCIABILITÀ BEST-EFFORT — MAI fonte di verità per logica critica
 * (numerazione verbali, fatturazione, stati di prodotto). Questo helper registra
 * eventi salienti in `public.audit_events` in modo NON BLOCCANTE: qualunque
 * errore (RLS, rete, permessi) viene solo loggato in console e MAI propagato al
 * chiamante. Va invocato FUORI dalla transazione di business della mutazione:
 * se l'audit fallisce, la mutazione resta valida.
 *
 * PAYLOAD: solo riferimenti e delta minimi (id collegati, valori booleani/enum).
 * MAI dati sensibili — niente password, niente PII estesa, niente contenuti.
 *
 * `.insert()` è chiamato SENZA `.select()` di proposito: la policy SELECT è
 * admin-only, quindi un RETURNING per attori non-admin (planner/tecnico) sarebbe
 * negato dalla pass-through RLS. Non aggiungere mai `.select()` qui.
 *
 * `actorUserId` è passato SEMPRE esplicitamente dal chiamante (che conosce già
 * l'utente autenticato), mai dedotto da auth.uid() qui dentro.
 */

/** Vocabolario controllato v1 — 21 eventi. Ampliabile senza migration (TEXT a DB). */
export type AuditEventType =
  // Visite
  | "visita.creata"
  | "visita.slot_collegato"
  // Verbali
  | "verbale.chiuso"
  | "verbale.pdf_generato"
  | "verbale.sostitutivo_creato"
  | "verbale.duplicato"
  | "verbale.bozza_eliminata"
  // Utenti
  | "utente.creato"
  | "utente.ruolo_modificato"
  | "utente.disattivato"
  | "utente.riattivato"
  | "utente.eliminato_fisico"
  | "utente.password_reset"
  // Clienti
  | "cliente.creato"
  | "cliente.disattivato"
  | "cliente.riattivato"
  | "cliente.eliminato_fisico"
  // Sedi
  | "sede.creata"
  | "sede.disattivata"
  | "sede.riattivata"
  | "sede.eliminata_fisica";

export type AuditEntityType = "visita" | "verbale" | "utente" | "cliente" | "sede";

export interface AuditEventInput {
  entityType: AuditEntityType;
  entityId: string;
  eventType: AuditEventType;
  /** Utente che compie l'azione. Null solo per eventi di sistema/attore ignoto. */
  actorUserId: string | null;
  /** Riferimenti/delta minimi. MAI dati sensibili. */
  payload?: Record<string, unknown>;
}

export async function logAuditEvent(ev: AuditEventInput): Promise<void> {
  try {
    const supabase = await createClient();
    // NB: nessun .select() — vedi commento in testa al file.
    const { error } = await supabase.from("audit_events").insert({
      entity_type: ev.entityType,
      entity_id: ev.entityId,
      actor_user_id: ev.actorUserId,
      event_type: ev.eventType,
      payload: ev.payload ?? {},
    });
    if (error) {
      console.error(
        `[audit] insert fallito (non bloccante) ${ev.eventType} su ${ev.entityType}:${ev.entityId}:`,
        error.message
      );
    }
  } catch (e) {
    // Qualunque eccezione (createClient fuori request, rete, ecc.) è ingoiata:
    // l'audit non deve MAI far fallire la mutazione chiamante.
    console.error(
      `[audit] eccezione (non bloccante) ${ev.eventType} su ${ev.entityType}:${ev.entityId}:`,
      e instanceof Error ? e.message : e
    );
  }
}
