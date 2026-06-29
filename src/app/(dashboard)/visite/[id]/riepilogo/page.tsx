import Link from "next/link";
import { notFound } from "next/navigation";
import { getVisitaById } from "@/lib/db/queries/visite";
import { getRisposteByVisita } from "@/lib/db/queries/risposte";
import type { EsitoRisposta } from "@/types";
import RiepilogoClient from "./RiepilogoClient";

export interface ConteggiSezione {
  id: string;
  nome: string;
  C: number;
  PC: number;
  NC: number;
  NV: number;
  NA: number;
  nonRisposto: number;
  obbligatorieSenzaRisposta: number;
}

export default async function RiepilogoPage({
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
  const valorePer = new Map<string, EsitoRisposta | null>(
    risposte.map((r) => [r.domanda_id, r.valore])
  );

  const sezioni = [...visita.template_snapshot.sezioni].sort(
    (a, b) => a.ordine - b.ordine
  );

  const conteggi: ConteggiSezione[] = sezioni.map((sez) => {
    const c: ConteggiSezione = {
      id: sez.id,
      nome: sez.nome,
      C: 0,
      PC: 0,
      NC: 0,
      NV: 0,
      NA: 0,
      nonRisposto: 0,
      obbligatorieSenzaRisposta: 0,
    };
    for (const d of sez.domande) {
      const v = valorePer.get(d.id) ?? null;
      if (v === null) {
        c.nonRisposto += 1;
        if (d.obbligatoria) c.obbligatorieSenzaRisposta += 1;
      } else {
        c[v] += 1;
      }
    }
    return c;
  });

  const totali = {
    NC: conteggi.reduce((s, c) => s + c.NC, 0),
    PC: conteggi.reduce((s, c) => s + c.PC, 0),
    nonRisposto: conteggi.reduce((s, c) => s + c.nonRisposto, 0),
    obbligatorieSenzaRisposta: conteggi.reduce(
      (s, c) => s + c.obbligatorieSenzaRisposta,
      0
    ),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          href={`/visite/${id}/checklist`}
          className="text-sm text-[#1e3a5f] hover:underline"
        >
          ← Torna alla checklist
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          Riepilogo sopralluogo
        </h1>
        <p className="text-sm text-gray-600">
          {visita.cliente_nome} · {visita.sede_nome}
        </p>
      </div>

      <RiepilogoClient
        visitaId={id}
        conteggi={conteggi}
        totali={totali}
        noteIniziali={visita.note_conclusive ?? ""}
      />
    </div>
  );
}
