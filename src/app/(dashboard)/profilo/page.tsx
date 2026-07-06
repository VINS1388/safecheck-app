import { redirect } from "next/navigation";
import { getProfiloCorrente } from "@/lib/server/profilo";
import { getProfiloOrganizzazione } from "@/lib/server/org-profilo";
import { aggiornaProfiloAction } from "./actions";

export const metadata = { title: "Il mio profilo · SafeCheck" };

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";
const inputRO =
  "mt-1 w-full cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500";

const RUOLO_LABEL: Record<string, string> = {
  admin: "Amministratore",
  planner: "Pianificatore",
  specialist: "Tecnico",
};

/**
 * Pagina /profilo (Sprint 16.6). Self-service: ogni utente attivo vede e modifica
 * i propri dati anagrafici (nome/telefono/qualifica). Email e ruolo in sola lettura
 * (email = fuori scope Auth; ruolo = governance admin da /organizzazione).
 */
export default async function ProfiloPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { msg, err } = await searchParams;
  const [profilo, org] = await Promise.all([getProfiloCorrente(), getProfiloOrganizzazione()]);
  if (!profilo) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Il mio profilo</h1>
        <p className="text-sm text-gray-500">
          Aggiorna i tuoi dati anagrafici. Email e ruolo sono gestiti
          dall&apos;amministratore.
        </p>
      </div>

      {msg && (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">{msg}</p>
      )}
      {err && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</p>
      )}

      <form action={aggiornaProfiloAction} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nome completo <span className="text-red-500">*</span>
          </label>
          <input name="nome_completo" required defaultValue={profilo.nome_completo} className={inputCls} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Telefono</label>
            <input name="telefono" defaultValue={profilo.telefono ?? ""} className={inputCls} placeholder="+39 …" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Qualifica</label>
            <input name="qualifica" defaultValue={profilo.qualifica ?? ""} className={inputCls} placeholder="es. RSPP" />
          </div>
        </div>

        <hr className="border-gray-100" />
        <p className="text-xs uppercase tracking-wide text-gray-400">Gestiti dall&apos;amministratore</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-500">Email</label>
            <input value={profilo.email} disabled className={inputRO} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Ruolo</label>
            <input value={RUOLO_LABEL[profilo.ruolo] ?? profilo.ruolo} disabled className={inputRO} />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="rounded-md bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Salva modifiche
          </button>
        </div>
      </form>

      {/* Organizzazione (sola lettura per tutti; la modifica è in area admin) */}
      {org && (
        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">Organizzazione</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {(
              [
                ["Ragione sociale", org.ragione_sociale],
                ["P.IVA", org.partita_iva],
                [
                  "Sede",
                  [org.indirizzo, org.cap, org.citta, org.provincia ? `(${org.provincia})` : null]
                    .filter(Boolean)
                    .join(" ") || null,
                ],
                ["Email", org.email],
                ["Telefono", org.telefono],
              ] as [string, string | null][]
            ).map(([label, valore]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-gray-50 py-1">
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="text-right text-sm text-gray-900">{valore || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </main>
  );
}
