import { cn } from "@/lib/utils";

// DataTable (Sprint 16.5 · S2) — base LEAN per il pattern tabella-desktop /
// card-mobile, oggi ricopiato a mano (skeleton <table> duplicato 3×, con
// dual-render manuale). Incorpora la strategia responsive del progetto: tabella
// da `sm:` in su, lista di card sotto.
//
// Perimetro S2: primitiva base, NON migra le pagine. È volutamente minimale;
// va validata quando la prima pagina la adotterà (step applicativo successivo).
// Se all'adozione servisse molto di più (sorting, sticky header, selezione),
// si estende allora — non qui.

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** Etichetta usata nel fallback card mobile (default: `header`). */
  cardLabel?: string;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  /** Card mobile custom. Se assente, si usa un fallback etichetta/valore per colonna. */
  renderCard?: (row: T) => React.ReactNode;
  /** Reso quando `rows` è vuoto (es. <EmptyState/>). */
  vuoto?: React.ReactNode;
  className?: string;
}

export default function DataTable<T>({
  columns,
  rows,
  keyOf,
  renderCard,
  vuoto,
  className,
}: Props<T>) {
  if (rows.length === 0 && vuoto) return <>{vuoto}</>;

  return (
    <div className={className}>
      {/* Desktop: tabella */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-4 py-3 font-medium",
                    c.align === "right" && "text-right"
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={keyOf(row)} className="hover:bg-gray-50">
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-4 py-3",
                      c.align === "right" && "text-right",
                      c.className
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card */}
      <div className="space-y-3 sm:hidden">
        {rows.map((row) =>
          renderCard ? (
            <div key={keyOf(row)}>{renderCard(row)}</div>
          ) : (
            <div
              key={keyOf(row)}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <dl className="space-y-1.5">
                {columns.map((c, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <dt className="text-xs font-medium text-gray-500">
                      {c.cardLabel ?? c.header}
                    </dt>
                    <dd className="text-right text-sm text-gray-900">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        )}
      </div>
    </div>
  );
}
