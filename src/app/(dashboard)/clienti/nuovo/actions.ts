"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManagePlanning } from "@/lib/auth/rbac";
import { creaCliente } from "@/lib/db/queries/clienti";

function opt(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v ? v : null;
}

export async function creaClienteAction(formData: FormData) {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!(await canManagePlanning())) {
    throw new Error("Non hai i permessi per creare clienti.");
  }

  const ragione_sociale = String(formData.get("ragione_sociale") ?? "").trim();
  const citta = String(formData.get("citta") ?? "").trim();
  const provincia = String(formData.get("provincia") ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);

  if (!ragione_sociale || !citta || !provincia) {
    throw new Error("Ragione sociale, città e provincia sono obbligatori.");
  }

  const id = await creaCliente({
    ragione_sociale,
    citta,
    provincia,
    partita_iva: opt(formData, "partita_iva"),
    indirizzo_sede_legale: opt(formData, "indirizzo_sede_legale"),
    referente_principale: opt(formData, "referente_principale"),
    email_referente: opt(formData, "email_referente"),
  });

  revalidatePath("/clienti");
  redirect(`/clienti/${id}`);
}
