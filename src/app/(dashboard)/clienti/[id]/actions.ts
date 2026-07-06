"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManagePlanning, canHardDelete } from "@/lib/auth/rbac";
import {
  aggiornaCliente,
  disattivaCliente,
  riattivaCliente,
  eliminaClienteFisico,
} from "@/lib/db/queries/clienti";

const ERR_PERM = encodeURIComponent("Non hai i permessi per questa operazione.");

function opt(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v ? v : null;
}

/** Modifica l'anagrafica (sede legale) del cliente. */
export async function aggiornaClienteAction(id: string, formData: FormData) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManagePlanning())) redirect(`/clienti/${id}?err=${ERR_PERM}`);

  const ragione_sociale = String(formData.get("ragione_sociale") ?? "").trim();
  const citta = String(formData.get("citta") ?? "").trim();
  const provincia = String(formData.get("provincia") ?? "").trim().toUpperCase().slice(0, 2);
  if (!ragione_sociale || !citta || !provincia) {
    throw new Error("Ragione sociale, città e provincia sono obbligatori.");
  }

  await aggiornaCliente(id, {
    ragione_sociale,
    citta,
    provincia,
    partita_iva: opt(formData, "partita_iva"),
    codice_fiscale: opt(formData, "codice_fiscale"),
    indirizzo_sede_legale: opt(formData, "indirizzo_sede_legale"),
    cap: opt(formData, "cap"),
    referente_principale: opt(formData, "referente_principale"),
    telefono_referente: opt(formData, "telefono_referente"),
    email_referente: opt(formData, "email_referente"),
  });

  revalidatePath(`/clienti/${id}`);
  redirect(`/clienti/${id}?msg=${encodeURIComponent("Cliente aggiornato.")}`);
}

/** Disattiva il cliente (soft, reversibile — non bloccata; avviso impatti in UI). */
export async function disattivaClienteAction(id: string) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManagePlanning())) redirect(`/clienti/${id}?err=${ERR_PERM}`);

  const esito = await disattivaCliente(id);
  if (!esito.ok) {
    redirect(`/clienti/${id}/modifica?err=${encodeURIComponent(esito.motivo)}`);
  }
  revalidatePath("/clienti");
  revalidatePath("/dashboard");
  redirect(`/clienti?msg=${encodeURIComponent("Cliente disattivato.")}`);
}

/** Eliminazione FISICA del cliente (solo admin, solo se pulito). */
export async function eliminaClienteFisicoAction(id: string) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canHardDelete())) redirect(`/clienti/${id}/modifica?err=${ERR_PERM}`);

  const esito = await eliminaClienteFisico(id);
  if (!esito.ok) {
    redirect(`/clienti/${id}/modifica?err=${encodeURIComponent(esito.motivo)}`);
  }
  revalidatePath("/clienti");
  revalidatePath("/dashboard");
  redirect(`/clienti?msg=${encodeURIComponent("Cliente eliminato definitivamente.")}`);
}

/** Riattiva un cliente disattivato. */
export async function riattivaClienteAction(id: string) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManagePlanning())) redirect(`/clienti/${id}?err=${ERR_PERM}`);

  const esito = await riattivaCliente(id);
  revalidatePath("/clienti");
  revalidatePath("/dashboard");
  if (!esito.ok) {
    redirect(`/clienti?archiviati=1&err=${encodeURIComponent(esito.motivo)}`);
  }
  redirect(`/clienti/${id}?msg=${encodeURIComponent("Cliente riattivato.")}`);
}
