"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  type Filtri,
  type PeriodoPreset,
  toQueryString,
  contaFiltriAttivi,
} from "@/lib/filters";

/**
 * FilterBar condivisa (Sprint 16.5). Ogni pagina attiva SOLO le dimensioni utili
 * via `config` (nessun hardcode). Stato persistito nell'URL (querystring),
 * navigazione con router (no reload). Desktop: barra compatta. Mobile: chip dei
 * filtri attivi sempre visibili + bottom sheet.
 *
 * Regole di dominio:
 *  - "Tecnico" reso solo se `mostraTecnico` (admin/planner) — per lo specialist
 *    la dimensione non viene mai renderizzata.
 *  - "Tipologia" resa solo se ha >1 valore (oggi un solo valore → invisibile).
 *  - "Sede" dipende dal cliente selezionato: le opzioni si restringono; cambiando
 *    cliente una sede incoerente viene azzerata.
 */

export interface OpzioneSelect {
  value: string;
  label: string;
}
export interface SedeOpzione extends OpzioneSelect {
  clienteId: string;
}
export interface FilterConfig {
  cliente?: boolean;
  sede?: boolean;
  tecnico?: boolean;
  stato?: OpzioneSelect[];
  periodo?: boolean;
  tipologia?: OpzioneSelect[];
  criticita?: boolean;
}
export interface FilterBarProps {
  config: FilterConfig;
  filtri: Filtri;
  clienti?: OpzioneSelect[];
  sedi?: SedeOpzione[];
  tecnici?: OpzioneSelect[];
  mostraTecnico?: boolean;
  periodoDefault?: PeriodoPreset; // default di contesto (30gg dashboard, "sempre" sezioni)
}

const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  sempre: "Sempre",
  oggi: "Oggi",
  "7gg": "Ultimi 7 giorni",
  "30gg": "Ultimi 30 giorni",
  personalizzato: "Personalizzato",
};

const selectCls =
  "min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default function FilterBar({
  config,
  filtri,
  clienti = [],
  sedi = [],
  tecnici = [],
  mostraTecnico = false,
  periodoDefault = "30gg",
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);

  const mostraTipologia = (config.tipologia?.length ?? 0) > 1;
  const nAttivi = contaFiltriAttivi(filtri, periodoDefault);

  function applica(next: Filtri) {
    router.push(`${pathname}${toQueryString(next, periodoDefault)}`, { scroll: false });
  }
  function set(patch: Partial<Filtri>) {
    let next: Filtri = { ...filtri, ...patch };
    if ("cliente" in patch) {
      // sede dipende dal cliente: azzera una sede che non appartiene al nuovo cliente
      if (next.sede && !sedi.some((s) => s.value === next.sede && s.clienteId === next.cliente)) {
        next = { ...next, sede: undefined };
      }
    }
    if ("periodo" in patch && patch.periodo !== "personalizzato") {
      next = { ...next, da: undefined, a: undefined };
    }
    applica(next);
  }
  function azzeraTutto() {
    applica({ periodo: periodoDefault });
    setSheet(false);
  }

  // Opzioni sede ristrette al cliente selezionato (se presente).
  const sediVisibili = filtri.cliente ? sedi.filter((s) => s.clienteId === filtri.cliente) : sedi;

  // ── Chip filtri attivi ──────────────────────────────────────────────────
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  const nomeDa = (arr: OpzioneSelect[], v?: string) => arr.find((o) => o.value === v)?.label ?? v;
  if (filtri.cliente) chips.push({ key: "cliente", label: `Cliente: ${nomeDa(clienti, filtri.cliente)}`, onRemove: () => set({ cliente: undefined, sede: undefined }) });
  if (filtri.sede) chips.push({ key: "sede", label: `Sede: ${nomeDa(sedi, filtri.sede)}`, onRemove: () => set({ sede: undefined }) });
  if (filtri.tecnico && mostraTecnico) chips.push({ key: "tecnico", label: `Tecnico: ${nomeDa(tecnici, filtri.tecnico)}`, onRemove: () => set({ tecnico: undefined }) });
  if (filtri.stato && config.stato) chips.push({ key: "stato", label: `Stato: ${nomeDa(config.stato, filtri.stato)}`, onRemove: () => set({ stato: undefined }) });
  if (filtri.periodo !== periodoDefault)
    chips.push({
      key: "periodo",
      label: filtri.periodo === "personalizzato" ? `Periodo: ${filtri.da ?? "…"} → ${filtri.a ?? "…"}` : `Periodo: ${PERIODO_LABEL[filtri.periodo]}`,
      onRemove: () => set({ periodo: periodoDefault }),
    });
  if (filtri.tipologia && mostraTipologia) chips.push({ key: "tipologia", label: `Tipologia: ${nomeDa(config.tipologia!, filtri.tipologia)}`, onRemove: () => set({ tipologia: undefined }) });
  if (filtri.criticita) chips.push({ key: "criticita", label: "Solo con NC", onRemove: () => set({ criticita: undefined }) });

  // ── Controlli (riusati in barra desktop e bottom sheet) ─────────────────
  const controlli = (
    <>
      {config.cliente && (
        <Campo label="Cliente">
          <select className={selectCls} value={filtri.cliente ?? ""} onChange={(e) => set({ cliente: e.target.value || undefined })}>
            <option value="">Tutti</option>
            {clienti.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Campo>
      )}
      {config.sede && (
        <Campo label="Sede">
          <select className={selectCls} value={filtri.sede ?? ""} onChange={(e) => set({ sede: e.target.value || undefined })}>
            <option value="">Tutte</option>
            {sediVisibili.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Campo>
      )}
      {config.tecnico && mostraTecnico && (
        <Campo label="Tecnico">
          <select className={selectCls} value={filtri.tecnico ?? ""} onChange={(e) => set({ tecnico: e.target.value || undefined })}>
            <option value="">Tutti</option>
            {tecnici.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Campo>
      )}
      {config.stato && (
        <Campo label="Stato">
          <select className={selectCls} value={filtri.stato ?? ""} onChange={(e) => set({ stato: e.target.value || undefined })}>
            <option value="">Tutti</option>
            {config.stato.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Campo>
      )}
      {mostraTipologia && (
        <Campo label="Tipologia">
          <select className={selectCls} value={filtri.tipologia ?? ""} onChange={(e) => set({ tipologia: e.target.value || undefined })}>
            <option value="">Tutte</option>
            {config.tipologia!.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Campo>
      )}
      {config.periodo && (
        <Campo label="Periodo">
          <select className={selectCls} value={filtri.periodo} onChange={(e) => set({ periodo: e.target.value as PeriodoPreset })}>
            {(Object.keys(PERIODO_LABEL) as PeriodoPreset[]).map((p) => (
              <option key={p} value={p}>{PERIODO_LABEL[p]}</option>
            ))}
          </select>
          {filtri.periodo === "personalizzato" && (
            <div className="mt-2 flex gap-2">
              <input type="date" className={selectCls} value={filtri.da ?? ""} onChange={(e) => set({ da: e.target.value || undefined })} aria-label="Data da" />
              <input type="date" className={selectCls} value={filtri.a ?? ""} onChange={(e) => set({ a: e.target.value || undefined })} aria-label="Data a" />
            </div>
          )}
        </Campo>
      )}
      {config.criticita && (
        <Campo label="Criticità">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
            <input type="checkbox" checked={!!filtri.criticita} onChange={(e) => set({ criticita: e.target.checked ? true : undefined })} className="h-4 w-4 accent-[#dc2626]" />
            Solo con NC
          </label>
        </Campo>
      )}
    </>
  );

  return (
    <div className="mb-4">
      {/* Barra desktop */}
      <div className="hidden items-end gap-3 sm:flex sm:flex-wrap">
        {controlli}
        {nAttivi > 0 && (
          <button type="button" onClick={azzeraTutto} className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Azzera filtri
          </button>
        )}
      </div>

      {/* Mobile: bottone Filtri + chip attivi sempre visibili */}
      <div className="sm:hidden">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSheet(true)} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800">
            Filtri{nAttivi > 0 ? ` (${nAttivi})` : ""}
          </button>
          {nAttivi > 0 && (
            <button type="button" onClick={azzeraTutto} className="text-sm font-medium text-gray-500 underline">
              Azzera
            </button>
          )}
        </div>
      </div>

      {/* Chip filtri attivi (sopra la lista, entrambe le viste) */}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 py-1 pl-3 pr-1.5 text-xs font-medium text-brand">
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`Rimuovi ${c.label}`} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand/20">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Bottom sheet mobile */}
      {sheet && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Filtri</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="Chiudi" className="flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100">
                ×
              </button>
            </div>
            <div className="space-y-4">{controlli}</div>
            <div className="mt-5 flex gap-3">
              {nAttivi > 0 && (
                <button type="button" onClick={azzeraTutto} className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700">
                  Azzera
                </button>
              )}
              <button type="button" onClick={() => setSheet(false)} className="min-h-[44px] flex-1 rounded-lg bg-brand text-sm font-semibold text-white hover:bg-brand-hover">
                Applica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[10rem] flex-1 sm:flex-none">
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}
