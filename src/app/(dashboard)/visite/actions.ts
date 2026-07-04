"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { eliminaVisitaBozza } from "@/lib/db/queries/visite";

export type EliminaBozzaResult = { ok: true } | { ok: false; error: string };

/** Elimina una bozza (guard: solo stato bozza). Usata dall'archivio. */
export async function eliminaBozzaAction(id: string): Promise<EliminaBozzaResult> {
  const { user } = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  const res = await eliminaVisitaBozza(id);
  if (!res.ok) return { ok: false, error: res.motivo ?? "Errore." };
  revalidatePath("/visite");
  revalidatePath("/dashboard");
  return { ok: true };
}
