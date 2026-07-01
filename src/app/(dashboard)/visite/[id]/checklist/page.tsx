import { notFound } from "next/navigation";
import { getVisitaById } from "@/lib/db/queries/visite";
import {
  getRisposteByVisita,
  estraiNominativi,
  estraiLavoratori,
} from "@/lib/db/queries/risposte";
import {
  getImpreseByVisita,
  getRisposteImpreseByVisita,
} from "@/lib/db/queries/imprese";
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
  const nominativi = estraiNominativi(risposte);
  const lavoratori = estraiLavoratori(risposte);
  const imprese = await getImpreseByVisita(id);
  const risposteImprese = await getRisposteImpreseByVisita(id);

  return (
    <ChecklistClient
      visitaId={visita.id}
      clienteNome={visita.cliente_nome}
      sedeNome={visita.sede_nome}
      sedeIndirizzo={visita.sede_indirizzo}
      sedeCitta={visita.sede_citta}
      dataVisita={visita.data_visita}
      oraInizio={visita.ora_inizio}
      specialistNome={visita.specialist_nome}
      qualifica={visita.qualifica_tecnico}
      referenteCliente={visita.referente_cliente}
      stato={visita.stato}
      numeroVerbale={visita.numero_verbale}
      template={visita.template_snapshot}
      risposteIniziali={risposte}
      nominativiIniziali={nominativi}
      lavoratoriIniziali={lavoratori}
      impreseIniziali={imprese}
      risposteImpreseIniziali={risposteImprese}
    />
  );
}
