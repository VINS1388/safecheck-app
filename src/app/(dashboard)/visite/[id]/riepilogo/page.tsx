import Link from "next/link";
import { notFound } from "next/navigation";
import { getVisitaById } from "@/lib/db/queries/visite";
import { getRisposteByVisita } from "@/lib/db/queries/risposte";
import {
  getImpreseByVisita,
  getRisposteImpreseByVisita,
} from "@/lib/db/queries/imprese";
import {
  richiedeTesto,
  sezioneCollassata,
  completezzaImpreseSezioneOtto,
} from "@/lib/checklist/completa";
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
  // Domande con esito selezionato ma campo testo obbligatorio mancante
  // (azione correttiva per NC/PC, motivazione per NV/NA).
  campoMancante: number;
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
  const rispostaPer = new Map(risposte.map((r) => [r.domanda_id, r]));

  // SEZ-08 multi-impresa: imprese + risposte per impresa (vuote per legacy v1).
  const imprese = await getImpreseByVisita(id);
  const risposteImprese = await getRisposteImpreseByVisita(id);
  const rispostaImpresaPer = new Map(
    risposteImprese.map((r) => [`${r.impresaId}:${r.domandaId}`, r])
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
      campoMancante: 0,
      obbligatorieSenzaRisposta: 0,
    };
    // Logica condizionale di sezione: se la filtro è NA, le altre domande non
    // sono richieste e non vanno conteggiate (né come NA, né come mancanti).
    const valoreFiltro = sez.domanda_filtro
      ? ((rispostaPer.get(sez.domanda_filtro)?.valore ?? null) as EsitoRisposta | null)
      : null;
    const collassata = sezioneCollassata(sez, valoreFiltro);
    const multiEspansa = Boolean(sez.multi_impresa) && !collassata;

    for (const d of sez.domande) {
      if (collassata && d.id !== sez.domanda_filtro) continue;
      // Multi-impresa: le D-08-002..009 sono aggregate sotto, per impresa.
      if (multiEspansa && d.id !== sez.domanda_filtro) continue;
      const r = rispostaPer.get(d.id);
      const v = (r?.valore ?? null) as EsitoRisposta | null;
      if (v === null) {
        c.nonRisposto += 1;
        if (d.obbligatoria) c.obbligatorieSenzaRisposta += 1;
      } else {
        c[v] += 1;
        // Esito selezionato ma campo testo obbligatorio mancante.
        const testo = v === "PC" || v === "NC" ? r?.azione_correttiva : r?.osservazioni;
        if (richiedeTesto(v) && !(testo ?? "").trim()) {
          c.campoMancante += 1;
        }
      }
    }

    // Multi-impresa espansa: aggrega le risposte di tutte le imprese (N × 8)
    // nei conteggi della sezione e somma le slot mancanti come obbligatorie.
    if (multiEspansa) {
      for (const r of risposteImprese) {
        c[r.esito] += 1;
      }
      const dids = sez.domande
        .filter((d) => d.id !== sez.domanda_filtro)
        .map((d) => d.id);
      const { mancanti } = completezzaImpreseSezioneOtto(
        dids,
        imprese.map((i) => i.id),
        (impId, did) => rispostaImpresaPer.get(`${impId}:${did}`) ?? null
      );
      c.obbligatorieSenzaRisposta += mancanti;
      c.nonRisposto += mancanti;
    }
    return c;
  });

  const totali = {
    NC: conteggi.reduce((s, c) => s + c.NC, 0),
    PC: conteggi.reduce((s, c) => s + c.PC, 0),
    // "Non risposte" include sia le domande senza esito sia quelle con esito
    // ma campo testo obbligatorio non compilato.
    nonRisposto: conteggi.reduce((s, c) => s + c.nonRisposto + c.campoMancante, 0),
    campoMancante: conteggi.reduce((s, c) => s + c.campoMancante, 0),
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
        stato={visita.stato}
        numeroVerbale={visita.numero_verbale}
        conteggi={conteggi}
        totali={totali}
        noteIniziali={visita.note_conclusive ?? ""}
      />
    </div>
  );
}
