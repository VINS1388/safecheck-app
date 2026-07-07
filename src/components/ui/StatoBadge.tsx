import Badge, { type BadgeTone } from "./Badge";

// Badge di stato verbale condiviso (Sprint 15.1). Gerarchia cromatica unica:
//   grigio (bozza/incompleto) → verde (chiuso/fatto) → grigio scuro (sostituito).
// Usato in dashboard, archivio, scheda cliente, scheda sede — un solo punto di
// verità per i colori (elimina il BadgeVerbale duplicato per copia-incolla).
// Da S2 delega la geometria pill + i colori alla primitiva `Badge` (output
// invariato: bozza=neutral, chiuso=success, sostituito=archived).

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

// Mappa lo stato verbale sui `tone` semantici della primitiva Badge.
// Output identico al precedente STILE inline (neutral/success/archived).
const TONE: Record<StatoVerbaleUI, BadgeTone> = {
  bozza: "neutral",
  chiuso: "success",
  sostituito: "archived",
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
    <Badge tone={TONE[stato]} title={titolo} className={className}>
      {testo}
    </Badge>
  );
}
