"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManagePlanning } from "@/lib/auth/rbac";
import { creaSede } from "@/lib/db/queries/sedi";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

function opt(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v ? v : null;
}

export async function creaSedeAction(formData: FormData) {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!(await canManagePlanning())) {
    throw new Error("Non hai i permessi per creare sedi.");
  }

  const clienteId = String(formData.get("cliente_id") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const indirizzo = String(formData.get("indirizzo") ?? "").trim();
  const citta = String(formData.get("citta") ?? "").trim();

  if (!clienteId || !nome || !indirizzo || !citta) {
    throw new Error("Nome sede, indirizzo e città sono obbligatori.");
  }

  const sedeId = await creaSede({
    cliente_id: clienteId,
    nome,
    indirizzo,
    citta,
    cap: opt(formData, "cap"),
    provincia: opt(formData, "provincia"),
    referente_sede: opt(formData, "referente_sede"),
    telefono_referente: opt(formData, "telefono_referente"),
  });

  // Audit prima del redirect (che interrompe il flusso lanciando NEXT_REDIRECT).
  await logAuditEvent({
    entityType: "sede",
    entityId: sedeId,
    eventType: "sede.creata",
    actorUserId: user.id,
    payload: { cliente_id: clienteId },
  });

  revalidatePath(`/clienti/${clienteId}`);
  redirect(`/clienti/${clienteId}`);
}
