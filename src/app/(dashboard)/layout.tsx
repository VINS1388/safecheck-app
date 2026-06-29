import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logoutAction } from "@/app/(auth)/login/actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clienti", label: "Clienti" },
  { href: "/visite", label: "Visite" },
];

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
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar fissa */}
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col bg-[#1e3a5f] text-white">
        <div className="px-5 py-5">
          <span className="text-xl font-bold tracking-tight">SafeCheck</span>
          <p className="mt-0.5 text-[11px] text-white/60">
            Sicurezza sul lavoro
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="mb-3 text-[11px] uppercase tracking-wide text-white/55">
            {ruolo}
          </p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
            >
              Logout
            </button>
          </form>
        </div>
      </aside>

      {/* Area contenuto */}
      <main className="ml-60 flex-1 p-8">{children}</main>
    </div>
  );
}
