"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { setModuloSede } from "@/lib/db/queries/moduli";

/**
 * Attiva/disattiva un modulo (servizio) su una sede. L'enforcement admin/planner
 * vive in setModuloSede (modulo dati, pattern organizzazione.ts); qui si mappa
 * l'errore e si revalida la scheda sede.
 */
export type ServizioResult = { ok: true } | { ok: false; error: string };

export async function setModuloSedeAction(
  clienteId: string,
  sedeId: string,
  moduloId: string,
  attivo: boolean
): Promise<ServizioResult> {
  const { user } = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessione scaduta. Effettua di nuovo l'accesso." };
  try {
    await setModuloSede(sedeId, moduloId, attivo);
    revalidatePath(`/clienti/${clienteId}/sedi/${sedeId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Operazione non riuscita." };
  }
}
