"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { creaVisita, eliminaVisitaBozza } from "@/lib/db/queries/visite";
import {
  slotAncoraProponibile,
  collegaSlot,
  getModuloIdSlot,
} from "@/lib/db/queries/pianificazione";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

/**
 * Crea una nuova visita in bozza "fuori piano" (nessuno slot da collegare) e
 * reindirizza. Usata dove non esistono slot proponibili (zero frizione):
 *   <form action={nuovaVisitaAction.bind(null, clienteId, sedeId)}>
 */
export async function nuovaVisitaAction(
  clienteId: string,
  sedeId: string,
  moduloId?: string
) {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const visitaId = await creaVisita({
    clienteId,
    sedeId,
    specialistId: user.id,
    moduloId, // undefined → default sicurezza (sede mono-modulo, flusso invariato)
  });

  await logAuditEvent({
    entityType: "visita",
    entityId: visitaId,
    eventType: "visita.creata",
    actorUserId: user.id,
    payload: { cliente_id: clienteId, sede_id: sedeId, fuori_piano: true },
  });

  redirect(`/visite/${visitaId}/avvia`);
}

export type CreaVisitaConSlotResult =
  | { ok: true; visitaId: string }
  | { ok: false; error: string };

/**
 * Crea una nuova visita collegandola (o meno) a uno slot del piano.
 * `scelta` = id dello slot, oppure "fuori-piano".
 *
 * Atomicità del collegamento (FK impone create-before-link):
 *   1. re-verifica che lo slot sia ancora proponibile (early-out pulito);
 *   2. crea la visita (bozza);
 *   3. collega lo slot con guard atomico `visita_id IS NULL`;
 *   4. se il collegamento perde la corsa → elimina la bozza appena creata
 *      (compensazione) e restituisce un errore di ricarica. All-or-nothing,
 *      nessun verbale orfano, nessun 500.
 * `specialist_id` = utente creatore (Decisione B), indipendente dal tecnico
 * dello slot. Lo slot passa a 'eseguita' solo alla chiusura verbale (STEP 4).
 */
export async function creaVisitaConSlotAction(
  clienteId: string,
  sedeId: string,
  scelta: string,
  moduloId?: string
): Promise<CreaVisitaConSlotResult> {
  const { user } = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };

  if (!scelta) return { ok: false, error: "Seleziona un'opzione per continuare." };

  if (scelta === "fuori-piano") {
    // Fuori piano: il modulo è quello scelto (o default sicurezza su sede mono-modulo).
    const visitaId = await creaVisita({ clienteId, sedeId, specialistId: user.id, moduloId });
    await logAuditEvent({
      entityType: "visita",
      entityId: visitaId,
      eventType: "visita.creata",
      actorUserId: user.id,
      payload: { cliente_id: clienteId, sede_id: sedeId, fuori_piano: true },
    });
    return { ok: true, visitaId };
  }

  const slotId = scelta;
  const conflitto =
    "Questo slot è stato appena collegato a un'altra visita. Ricarica la pagina e riprova.";

  if (!(await slotAncoraProponibile(slotId))) {
    return { ok: false, error: conflitto };
  }

  // Da slot: la visita eredita il modulo del piano dello slot (coerenza garantita,
  // il moduloId del client è ignorato qui). collegaSlot ricontrolla comunque.
  const moduloSlot = (await getModuloIdSlot(slotId)) ?? undefined;
  const visitaId = await creaVisita({
    clienteId,
    sedeId,
    specialistId: user.id,
    moduloId: moduloSlot,
  });

  await logAuditEvent({
    entityType: "visita",
    entityId: visitaId,
    eventType: "visita.creata",
    actorUserId: user.id,
    payload: { cliente_id: clienteId, sede_id: sedeId, fuori_piano: false },
  });

  const collegato = await collegaSlot(slotId, visitaId, user.id);
  if (!collegato) {
    // Corsa persa nella finestra tra re-verifica e collegamento: annulla la bozza.
    // NB: nessun evento verbale.bozza_eliminata qui — è una compensazione tecnica
    // della corsa, non un'eliminazione voluta dall'utente (Decisione chiusa).
    await eliminaVisitaBozza(visitaId);
    return { ok: false, error: conflitto };
  }

  await logAuditEvent({
    entityType: "visita",
    entityId: visitaId,
    eventType: "visita.slot_collegato",
    actorUserId: user.id,
    payload: { slot_id: slotId },
  });

  return { ok: true, visitaId };
}
