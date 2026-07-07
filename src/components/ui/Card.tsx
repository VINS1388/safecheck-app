import { cn } from "@/lib/utils";

// Primitive contenitore (Sprint 16.5 · S2). La stringa
// `rounded-xl border border-gray-200 bg-white shadow-sm` era ricopiata verbatim
// in quasi ogni file: qui diventa una primitiva sola.
//
//   <Card>…</Card>                              → contenitore neutro
//   <SectionCard titolo="…" azione={<…/>}>…</SectionCard> → card con header

type Padding = "none" | "sm" | "md" | "lg";

const PAD: Record<Padding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

const BASE = "rounded-xl border border-gray-200 bg-white shadow-sm";

interface CardProps {
  padding?: Padding;
  className?: string;
  children: React.ReactNode;
}

export function Card({ padding = "md", className, children }: CardProps) {
  return <div className={cn(BASE, PAD[padding], className)}>{children}</div>;
}

interface SectionCardProps {
  titolo?: string;
  sottotitolo?: string;
  azione?: React.ReactNode;
  padding?: Padding;
  className?: string;
  children: React.ReactNode;
}

/** Card con header opzionale (titolo + sottotitolo + azione a destra). */
export function SectionCard({
  titolo,
  sottotitolo,
  azione,
  padding = "lg",
  className,
  children,
}: SectionCardProps) {
  return (
    <section className={cn(BASE, PAD[padding], className)}>
      {(titolo || azione) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {titolo && (
              <h2 className="text-base font-semibold text-gray-900">{titolo}</h2>
            )}
            {sottotitolo && (
              <p className="mt-0.5 text-xs text-gray-500">{sottotitolo}</p>
            )}
          </div>
          {azione && <div className="flex-shrink-0">{azione}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export default Card;
