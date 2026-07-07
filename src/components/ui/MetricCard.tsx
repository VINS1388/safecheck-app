import { Card } from "./Card";

// MetricCard (Sprint 16.5 · S2). Unifica i due tile-metrica esistenti: `Kpi`
// (dashboard) e `StatTile` (organizzazione), che erano due implementazioni
// parallele. Numeri con `tabular-nums` per allineamento in griglia.

export type MetricColore = "brand" | "success" | "warning" | "danger" | "neutral";

const COLORE: Record<MetricColore, string> = {
  brand: "text-brand",
  success: "text-green-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  neutral: "text-gray-900",
};

interface Props {
  etichetta: string;
  valore: React.ReactNode;
  sotto?: string;
  /** Testo informativo mostrato come tooltip su un'icona "i". */
  info?: string;
  colore?: MetricColore;
  className?: string;
}

export default function MetricCard({
  etichetta,
  valore,
  sotto,
  info,
  colore = "brand",
  className,
}: Props) {
  return (
    <Card padding="lg" className={className}>
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium text-gray-500">{etichetta}</p>
        {info && (
          <span
            title={info}
            className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] font-bold text-gray-400"
          >
            i
          </span>
        )}
      </div>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${COLORE[colore]}`}>{valore}</p>
      {sotto && <p className="mt-0.5 text-xs text-gray-400">{sotto}</p>}
    </Card>
  );
}
