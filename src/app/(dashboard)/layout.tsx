import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfiloOrganizzazione } from "@/lib/server/org-profilo";
import { logoutAction } from "@/app/(auth)/login/actions";
import DashboardShell from "./DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nome org per la shell (Sprint 19.D): stessa fonte di /organizzazione
  // (getProfiloOrganizzazione, lettura aperta agli autenticati attivi).
  const [{ user, profilo }, org] = await Promise.all([
    getCurrentUser(),
    getProfiloOrganizzazione(),
  ]);
  if (!user) {
    redirect("/login");
  }
  // Q4: un utente disattivato perde l'accesso all'app al primo request utile.
  if (profilo && !profilo.attivo) {
    redirect("/account-disattivato");
  }

  const nome = profilo?.nome_completo ?? user.email ?? "Utente";
  const ruolo = profilo?.ruolo ?? "specialist";

  return (
    <DashboardShell
      nome={nome}
      ruolo={ruolo}
      orgNome={org?.ragione_sociale ?? null}
      logoutAction={logoutAction}
    >
      {children}
    </DashboardShell>
  );
}
