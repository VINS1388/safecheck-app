"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManagePlanning, canHardDelete } from "@/lib/auth/rbac";
import {
  aggiornaSede,
  disattivaSede,
  riattivaSede,
  eliminaSedeFisica,
  impostaSedePrincipale,
} from "@/lib/db/queries/sedi";

const ERR_PERM = encodeURIComponent("Non hai i permessi per questa operazione.");

function opt(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v ? v : null;
}

/** Modifica i dati di una sede operativa. */
export async function aggiornaSedeAction(clienteId: string, sedeId: string, formData: FormData) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManagePlanning())) redirect(`/clienti/${clienteId}?err=${ERR_PERM}`);

  const nome = String(formData.get("nome") ?? "").trim();
  const indirizzo = String(formData.get("indirizzo") ?? "").trim();
  const citta = String(formData.get("citta") ?? "").trim();
  if (!nome || !indirizzo || !citta) {
    throw new Error("Nome sede, indirizzo e città sono obbligatori.");
  }

  await aggiornaSede(sedeId, {
    nome,
    indirizzo,
    citta,
    cap: opt(formData, "cap"),
    provincia: opt(formData, "provincia"),
    referente_sede: opt(formData, "referente_sede"),
    telefono_referente: opt(formData, "telefono_referente"),
  });

  revalidatePath(`/clienti/${clienteId}`);
  redirect(`/clienti/${clienteId}?msg=${encodeURIComponent("Sede aggiornata.")}`);
}

/** Disattiva una sede (soft, reversibile — non bloccata; avviso impatti in UI). */
export async function disattivaSedeAction(clienteId: string, sedeId: string) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManagePlanning())) redirect(`/clienti/${clienteId}?err=${ERR_PERM}`);

  const esito = await disattivaSede(sedeId);
  revalidatePath(`/clienti/${clienteId}`);
  if (!esito.ok) {
    redirect(`/clienti/${clienteId}?err=${encodeURIComponent(esito.motivo)}`);
  }
  redirect(`/clienti/${clienteId}?msg=${encodeURIComponent("Sede disattivata.")}`);
}

/** Riattiva una sede disattivata. */
export async function riattivaSedeAction(clienteId: string, sedeId: string) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManagePlanning())) redirect(`/clienti/${clienteId}?err=${ERR_PERM}`);

  const esito = await riattivaSede(sedeId);
  revalidatePath(`/clienti/${clienteId}`);
  if (!esito.ok) {
    redirect(`/clienti/${clienteId}?err=${encodeURIComponent(esito.motivo)}`);
  }
  redirect(`/clienti/${clienteId}?msg=${encodeURIComponent("Sede riattivata.")}`);
}

/** Eliminazione FISICA della sede (solo admin, solo se pulita). */
export async function eliminaSedeFisicaAction(clienteId: string, sedeId: string) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canHardDelete())) redirect(`/clienti/${clienteId}?err=${ERR_PERM}`);

  const esito = await eliminaSedeFisica(sedeId);
  revalidatePath(`/clienti/${clienteId}`);
  if (!esito.ok) {
    redirect(`/clienti/${clienteId}?err=${encodeURIComponent(esito.motivo)}`);
  }
  redirect(`/clienti/${clienteId}?msg=${encodeURIComponent("Sede eliminata definitivamente.")}`);
}

/** Imposta la sede come principale per il cliente. */
export async function impostaSedePrincipaleAction(clienteId: string, sedeId: string) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManagePlanning())) redirect(`/clienti/${clienteId}?err=${ERR_PERM}`);

  await impostaSedePrincipale(clienteId, sedeId);
  revalidatePath(`/clienti/${clienteId}`);
  redirect(`/clienti/${clienteId}?msg=${encodeURIComponent("Sede principale aggiornata.")}`);
}
