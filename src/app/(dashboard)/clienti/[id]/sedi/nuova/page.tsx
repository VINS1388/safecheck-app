import Link from "next/link";
import SedeForm from "../SedeForm";
import { creaSedeAction } from "./actions";

export default async function NuovaSedePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href={`/clienti/${id}`} className="text-sm text-[#1e3a5f] hover:underline">
          ← Scheda cliente
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Nuova sede</h1>
      </div>

      <SedeForm
        action={creaSedeAction}
        clienteId={id}
        hiddenClienteId={id}
        submitLabel="Salva sede"
      />
    </main>
  );
}
