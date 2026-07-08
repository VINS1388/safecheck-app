import SedeForm from "../SedeForm";
import { creaSedeAction } from "./actions";
import PageHeader from "@/components/ui/PageHeader";

export default async function NuovaSedePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-2xl">
      <PageHeader titolo="Nuova sede" backHref={`/clienti/${id}`} backLabel="Scheda cliente" />

      <SedeForm
        action={creaSedeAction}
        clienteId={id}
        hiddenClienteId={id}
        submitLabel="Salva sede"
      />
    </main>
  );
}
