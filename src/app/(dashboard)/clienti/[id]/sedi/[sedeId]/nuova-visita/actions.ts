"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { creaVisita } from "@/lib/db/queries/visite";

/**
 * Crea una nuova visita in bozza per la sede e reindirizza alla schermata
 * di avvio sopralluogo. Da usare in un <form> della scheda sede:
 *   <form action={nuovaVisitaAction.bind(null, clienteId, sedeId)}>
 */
export async function nuovaVisitaAction(clienteId: string, sedeId: string) {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const visitaId = await creaVisita({
    clienteId,
    sedeId,
    specialistId: user.id,
  });

  redirect(`/visite/${visitaId}/avvia`);
}
