import { getCurrentUser } from "@/lib/auth/current-user";

const CARDS = [
  { label: "Clienti", value: 0 },
  { label: "Visite", value: 0 },
  { label: "Verbali", value: 0 },
];

export default async function DashboardPage() {
  const { user, profilo } = await getCurrentUser();
  const nome = profilo?.nome_completo ?? user?.email ?? "Utente";
  const ruolo = profilo?.ruolo ?? "specialist";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">
        Benvenuto, {nome}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Ruolo: <span className="font-medium capitalize">{ruolo}</span>
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-[#1e3a5f]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-8 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        Sprint 3 completato — autenticazione funzionante
      </p>
    </div>
  );
}
