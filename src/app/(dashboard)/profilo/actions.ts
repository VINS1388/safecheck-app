"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEditOwnProfile } from "@/lib/auth/rbac";
import { aggiornaProfiloProprio } from "@/lib/server/profilo";

/**
 * Action di modifica del proprio profilo. Legge dal form SOLO i 3 campi whitelisted
 * (nome/telefono/qualifica): ruolo/attivo/email non sono nemmeno estratti dal
 * FormData, quindi non possono essere alterati per questa via.
 */
export async function aggiornaProfiloAction(formData: FormData) {
  const { user } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canEditOwnProfile())) redirect("/dashboard");

  const nome_completo = String(formData.get("nome_completo") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim() || null;
  const qualifica = String(formData.get("qualifica") ?? "").trim() || null;

  if (!nome_completo) {
    redirect(`/profilo?err=${encodeURIComponent("Il nome è obbligatorio.")}`);
  }

  await aggiornaProfiloProprio({ nome_completo, telefono, qualifica });
  revalidatePath("/profilo");
  redirect(`/profilo?msg=${encodeURIComponent("Profilo aggiornato.")}`);
}
