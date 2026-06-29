import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logoutAction } from "@/app/(auth)/login/actions";
import DashboardShell from "./DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profilo } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const nome = profilo?.nome_completo ?? user.email ?? "Utente";
  const ruolo = profilo?.ruolo ?? "specialist";

  return (
    <DashboardShell nome={nome} ruolo={ruolo} logoutAction={logoutAction}>
      {children}
    </DashboardShell>
  );
}
