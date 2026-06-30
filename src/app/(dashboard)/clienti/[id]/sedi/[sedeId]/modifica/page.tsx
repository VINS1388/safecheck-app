import Link from "next/link";
import { notFound } from "next/navigation";
import { getSedeById } from "@/lib/db/queries/sedi";
import SedeForm from "../../SedeForm";
import { aggiornaSedeAction } from "../../actions";

export default async function ModificaSedePage({
  params,
}: {
  params: Promise<{ id: string; sedeId: string }>;
}) {
  const { id, sedeId } = await params;

  const sede = await getSedeById(sedeId);
  if (!sede || sede.cliente_id !== id) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href={`/clienti/${id}`} className="text-sm text-[#1e3a5f] hover:underline">
          ← Scheda cliente
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Modifica sede</h1>
      </div>

      <SedeForm
        action={aggiornaSedeAction.bind(null, id, sedeId)}
        clienteId={id}
        sede={sede}
        submitLabel="Salva modifiche"
      />
    </main>
  );
}
