import { listaUtenti } from "@/lib/server/organizzazione";
import { getProfiloOrganizzazione } from "@/lib/server/org-profilo";
import OrganizzazioneClient from "./OrganizzazioneClient";

export const metadata = { title: "Organizzazione · SafeCheck" };

/**
 * Pagina /organizzazione (v1). Server component: carica la lista utenti dal
 * modulo dati unico (che verifica admin attivo) e deriva i conteggi di
 * riepilogo con un'unica query, poi delega l'interattività al client component.
 */
export default async function OrganizzazionePage() {
  const [utenti, org] = await Promise.all([listaUtenti(), getProfiloOrganizzazione()]);

  const riepilogo = {
    attivi: utenti.filter((u) => u.attivo).length,
    admin: utenti.filter((u) => u.attivo && u.ruolo === "admin").length,
    planner: utenti.filter((u) => u.attivo && u.ruolo === "planner").length,
    specialist: utenti.filter((u) => u.attivo && u.ruolo === "specialist").length,
  };

  return <OrganizzazioneClient utenti={utenti} riepilogo={riepilogo} organizzazione={org} />;
}
