import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

async function contatori() {
  const supabase = await createClient();

  const [clienti, visite, verbali] = await Promise.all([
    supabase.from("clienti").select("id", { count: "exact", head: true }).eq("attivo", true),
    supabase.from("visite").select("id", { count: "exact", head: true }),
    supabase.from("verbali_pdf").select("id", { count: "exact", head: true }),
  ]);

  return {
    clienti: clienti.count ?? 0,
    visite: visite.count ?? 0,
    verbali: verbali.count ?? 0,
  };
}

export default async function DashboardPage() {
  const { user, profilo } = await getCurrentUser();
  const nome = profilo?.nome_completo ?? user?.email ?? "Utente";
  const ruolo = profilo?.ruolo ?? "specialist";

  const counts = await contatori();
  const cards = [
    { label: "Clienti", value: counts.clienti, href: "/clienti" },
    { label: "Visite", value: counts.visite, href: "/visite" },
    { label: "Verbali", value: counts.verbali, href: "/visite" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Benvenuto, {nome}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Ruolo: <span className="font-medium capitalize">{ruolo}</span>
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#1e3a5f]/30 hover:shadow"
          >
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-[#1e3a5f]">{card.value}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
