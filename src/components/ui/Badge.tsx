import { cn } from "@/lib/utils";

// Primitiva Badge del design system (Sprint 16.5 · S2). Geometria pill unica
// (era ricopiata in StatoBadge, RuoloBadge, StatoBadgeUtente, Pill, BadgeModulo).
// I `tone` semantici seguono la gerarchia cromatica del progetto:
//   verde = ok · ambra = attenzione · rosso = criticità · grigio = neutro ·
//   slate = archiviato/ritirato · brand = accento navy tenue.
// Verde/ambra/rosso restano SOLO stati operativi, mai colori-ruolo (i ruoli
// usano tinte del navy — vedi RoleBadge).

export type BadgeTone =
  | "neutral" // grigio — bozza/incompleto/neutro
  | "success" // verde — fatto/conforme/attivo
  | "warning" // ambra — attenzione/parziale/in corso
  | "danger" // rosso — criticità/NC/scaduto
  | "brand" // navy tenue — accento informativo
  | "archived"; // slate pieno — sostituito/decommissionato

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  brand: "bg-brand/10 text-brand",
  archived: "bg-slate-600 text-white",
};

const BASE =
  "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";

interface Props {
  /** Colore semantico predefinito. Omissibile se si passa un `className` colore custom (es. RoleBadge). */
  tone?: BadgeTone;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

export default function Badge({ tone, className, title, children }: Props) {
  return (
    <span title={title} className={cn(BASE, tone && TONE[tone], className)}>
      {children}
    </span>
  );
}
