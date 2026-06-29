"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { aggiornaDatiAvvio } from "@/lib/db/queries/visite";

function opt(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v ? v : null;
}

export async function avviaSopralluogoAction(
  visitaId: string,
  formData: FormData
) {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const referente = String(formData.get("referente_cliente") ?? "").trim();
  const dataVisita = String(formData.get("data_visita") ?? "").trim();

  if (!referente || !dataVisita) {
    throw new Error("Referente cliente e data sopralluogo sono obbligatori.");
  }

  await aggiornaDatiAvvio(visitaId, {
    data_visita: dataVisita,
    ora_inizio: opt(formData, "ora_inizio"),
    referente_cliente: referente,
    qualifica_tecnico: opt(formData, "qualifica_tecnico"),
    note_preliminari: opt(formData, "note_preliminari"),
  });

  redirect(`/visite/${visitaId}/checklist`);
}
