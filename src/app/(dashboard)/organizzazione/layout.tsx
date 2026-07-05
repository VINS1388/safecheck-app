import { redirect } from "next/navigation";
import { canManageUsers } from "@/lib/auth/rbac";

/**
 * Guard server-side dell'area /organizzazione: accessibile SOLO agli admin
 * attivi. Non è un semplice link nascosto — chi non è admin viene reindirizzato
 * anche se digita l'URL a mano. Il layout dashboard padre gestisce già utente
 * non autenticato e utente disattivato.
 */
export default async function OrganizzazioneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await canManageUsers())) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
