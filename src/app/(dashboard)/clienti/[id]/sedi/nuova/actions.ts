"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { creaSede } from "@/lib/db/queries/sedi";

function opt(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v ? v : null;
}

export async function creaSedeAction(formData: FormData) {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const clienteId = String(formData.get("cliente_id") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const indirizzo = String(formData.get("indirizzo") ?? "").trim();
  const citta = String(formData.get("citta") ?? "").trim();

  if (!clienteId || !nome || !indirizzo || !citta) {
    throw new Error("Nome sede, indirizzo e città sono obbligatori.");
  }

  await creaSede({
    cliente_id: clienteId,
    nome,
    indirizzo,
    citta,
    cap: opt(formData, "cap"),
    provincia: opt(formData, "provincia"),
    referente_sede: opt(formData, "referente_sede"),
    telefono_referente: opt(formData, "telefono_referente"),
  });

  revalidatePath(`/clienti/${clienteId}`);
  redirect(`/clienti/${clienteId}`);
}
