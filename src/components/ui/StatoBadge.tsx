import { cn } from "@/lib/utils";

// Badge di stato verbale condiviso (Sprint 15.1). Gerarchia cromatica unica:
//   grigio (bozza/incompleto) → verde (chiuso/fatto) → grigio scuro (sostituito).
// Usato in dashboard, archivio, scheda cliente, scheda sede — un solo punto di
// verità per i colori (elimina il BadgeVerbale duplicato per copia-incolla).

export type StatoVerbaleUI = "bozza" | "chiuso" | "sostituito";

/** Deriva lo stato UI dai campi della visita. */
export function statoVerbaleUI(v: {
  stato_verbale?: string | null;
  numero_verbale?: string | null;
}): StatoVerbaleUI {
  if (v.stato_verbale === "sostituito") return "sostituito";
  if (v.numero_verbale != null) return "chiuso";
  return "bozza";
}

const STILE: Record<StatoVerbaleUI, string> = {
  bozza: "bg-gray-100 text-gray-600",
  chiuso: "bg-green-100 text-green-700",
  sostituito: "bg-slate-600 text-white",
};

interface Props {
  statoVerbale?: string | null;
  numeroVerbale?: string | null;
  className?: string;
}

/** Badge pill per lo stato del verbale di una visita. */
export default function StatoBadge({ statoVerbale, numeroVerbale, className }: Props) {
  const stato = statoVerbaleUI({ stato_verbale: statoVerbale, numero_verbale: numeroVerbale });
  const testo =
    stato === "sostituito"
      ? `${numeroVerbale} · Sostituito`
      : stato === "chiuso"
        ? numeroVerbale
        : "Bozza";
  const titolo =
    stato === "sostituito" ? "Verbale sostituito — non più valido" : undefined;
  return (
    <span
      title={titolo}
      className={cn(
        "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STILE[stato],
        className
      )}
    >
      {testo}
    </span>
  );
}
