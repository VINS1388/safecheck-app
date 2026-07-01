"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";
import { differenzaGiorni } from "@/lib/scadenze/calcola";
import { ETICHETTE_STATO_SLOT } from "@/types";
import type { StatoSlot } from "@/types";
import { setDataPianificataAction } from "./actions";

export interface SlotRiga {
  id: string;
  clienteId: string;
  clienteNome: string;
  sedeNome: string;
  numeroVisita: number;
  cicloNumero: number;
  dataSuggerita: string;
  dataPianificata: string | null;
  stato: StatoSlot;
  visitaId: string | null;
  tecnicoNome: string | null;
}

interface Props {
  slots: SlotRiga[];
  clientiFiltro: { id: string; nome: string }[];
  oggi: string; // ISO yyyy-mm-dd (data server)
}

type FiltroStato = "tutte" | StatoSlot | "urgenti";
type Urgenza = "scaduta" | "vicina" | "ok" | "neutro";

const BADGE_STATO: Record<StatoSlot, string> = {
  da_pianificare: "bg-gray-100 text-gray-600",
  pianificata: "bg-blue-100 text-blue-700",
  eseguita: "bg-green-100 text-green-700",
};

const BORDO_URGENZA: Record<Urgenza, string> = {
  scaduta: "border-l-4 border-l-red-500",
  vicina: "border-l-4 border-l-amber-400",
  ok: "border-l-4 border-l-green-400",
  neutro: "border-l-4 border-l-gray-200",
};

function urgenzaDi(s: SlotRiga, oggi: string): Urgenza {
  if (s.stato === "eseguita") return "neutro";
  const eff = s.dataPianificata ?? s.dataSuggerita;
  if (eff < oggi) return "scaduta";
  return differenzaGiorni(eff, oggi) <= 30 ? "vicina" : "ok";
}

export default function PianificazioneClient({ slots, clientiFiltro, oggi }: Props) {
  const router = useRouter();
  const [filtroStato, setFiltroStato] = useState<FiltroStato>("tutte");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [asc, setAsc] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const righe = useMemo(() => {
    let r = slots.filter((s) => {
      if (filtroCliente && s.clienteId !== filtroCliente) return false;
      if (filtroStato === "tutte") return true;
      if (filtroStato === "urgenti") {
        const u = urgenzaDi(s, oggi);
        return u === "scaduta" || u === "vicina";
      }
      return s.stato === filtroStato;
    });
    r = [...r].sort((a, b) => {
      const da = a.dataPianificata ?? a.dataSuggerita;
      const db = b.dataPianificata ?? b.dataSuggerita;
      return asc ? da.localeCompare(db) : db.localeCompare(da);
    });
    return r;
  }, [slots, filtroStato, filtroCliente, asc, oggi]);

  async function salvaData(slotId: string) {
    if (!editData) {
      setErrore("Seleziona una data.");
      return;
    }
    setSalvando(true);
    setErrore(null);
    const res = await setDataPianificataAction(slotId, editData);
    setSalvando(false);
    if (res.ok) {
      setEditId(null);
      setEditData("");
      router.refresh();
    } else {
      setErrore(res.error);
    }
  }

  const SELECT =
    "min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";

  return (
    <div>
      {/* Filtri */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value as FiltroStato)} className={SELECT}>
          <option value="tutte">Tutte</option>
          <option value="da_pianificare">Da pianificare</option>
          <option value="pianificata">Pianificate</option>
          <option value="eseguita">Eseguite</option>
          <option value="urgenti">In scadenza / scadute</option>
        </select>
        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className={SELECT}>
          <option value="">Tutti i clienti</option>
          {clientiFiltro.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAsc((v) => !v)}
          className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Data {asc ? "↑ crescente" : "↓ decrescente"}
        </button>
        <span className="ml-auto text-sm text-gray-500">{righe.length} visite</span>
      </div>

      {errore && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errore}</p>
      )}

      {righe.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Nessuna visita pianificata con questi filtri.
        </p>
      ) : (
        <ul className="space-y-2">
          {righe.map((s) => {
            const u = urgenzaDi(s, oggi);
            const dataEff = s.dataPianificata ?? s.dataSuggerita;
            const modificabile = s.stato !== "eseguita";
            const inEdit = editId === s.id;
            return (
              <li
                key={s.id}
                className={cn("rounded-lg border border-gray-200 bg-white p-3 shadow-sm", BORDO_URGENZA[u])}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {s.clienteNome} <span className="font-normal text-gray-500">· {s.sedeNome}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Visita {s.numeroVisita} (ciclo {s.cicloNumero})
                      {s.tecnicoNome ? ` · ${s.tecnicoNome}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn("text-sm font-medium", u === "scaduta" ? "text-red-600" : "text-gray-800")}>
                        {formatDate(dataEff)}
                      </p>
                      {!s.dataPianificata && <p className="text-[11px] text-gray-400">(suggerita)</p>}
                    </div>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", BADGE_STATO[s.stato])}>
                      {ETICHETTE_STATO_SLOT[s.stato]}
                    </span>
                  </div>
                </div>

                {/* Azioni */}
                {s.stato === "eseguita" && s.visitaId ? (
                  <div className="mt-2">
                    <Link
                      href={`/visite/${s.visitaId}/checklist`}
                      className="text-xs font-medium text-[#1e3a5f] hover:underline"
                    >
                      Apri verbale →
                    </Link>
                  </div>
                ) : modificabile ? (
                  inEdit ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={editData}
                        onChange={(e) => setEditData(e.target.value)}
                        className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => salvaData(s.id)}
                        disabled={salvando}
                        className="min-h-[38px] rounded-lg bg-[#1e3a5f] px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {salvando ? "…" : "Salva"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(null);
                          setErrore(null);
                        }}
                        className="min-h-[38px] rounded-lg border border-gray-300 px-3 text-xs text-gray-600"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(s.id);
                          setEditData(s.dataPianificata ?? s.dataSuggerita);
                          setErrore(null);
                        }}
                        className="text-xs font-medium text-[#1e3a5f] hover:underline"
                      >
                        {s.dataPianificata ? "Modifica data" : "Imposta data pianificata"}
                      </button>
                    </div>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
