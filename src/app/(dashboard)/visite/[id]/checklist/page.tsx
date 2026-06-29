import { notFound } from "next/navigation";
import { getVisitaById } from "@/lib/db/queries/visite";
import { getRisposteByVisita } from "@/lib/db/queries/risposte";
import ChecklistClient from "./ChecklistClient";

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const visita = await getVisitaById(id);
  if (!visita) {
    notFound();
  }

  const risposte = await getRisposteByVisita(id);

  return (
    <ChecklistClient
      visitaId={visita.id}
      clienteNome={visita.cliente_nome}
      sedeNome={visita.sede_nome}
      dataVisita={visita.data_visita}
      stato={visita.stato}
      template={visita.template_snapshot}
      risposteIniziali={risposte}
    />
  );
}
