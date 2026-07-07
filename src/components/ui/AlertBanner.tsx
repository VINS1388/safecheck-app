import { cn } from "@/lib/utils";

// AlertBanner (Sprint 16.5 · S2). Oggi convivono ≥2 linguaggi di messaggio
// (ErroreBox borderless in Organizzazione vs banner con bordo via searchParams
// in Profilo/Login, più warning amber inline sparsi). Qui un solo componente
// con 4 varianti semantiche coerenti con la gerarchia di stato.

export type AlertVariant = "info" | "success" | "warning" | "danger";

const STILE: Record<AlertVariant, string> = {
  info: "border-brand/20 bg-brand/5 text-brand",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-700",
};

interface Props {
  variant?: AlertVariant;
  titolo?: string;
  className?: string;
  /** Ruolo ARIA: `alert` per errori/avvisi attivi, `status` per conferme. */
  role?: "alert" | "status";
  children?: React.ReactNode;
}

export default function AlertBanner({
  variant = "info",
  titolo,
  className,
  role,
  children,
}: Props) {
  return (
    <div
      role={role}
      className={cn("rounded-lg border px-3 py-2 text-sm", STILE[variant], className)}
    >
      {titolo && <p className="font-semibold">{titolo}</p>}
      {children && <div className={titolo ? "mt-0.5" : undefined}>{children}</div>}
    </div>
  );
}
