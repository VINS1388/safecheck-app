// Badge tipologia/modulo (Sprint HACCP 1) — PREDISPOSTO per H2. Con un solo
// modulo attivo NON va mostrato (niente rumore per il cliente attuale): il
// chiamante passa `mostra` = (numero moduli attivabili > 1). Il componente
// ritorna null quando non deve comparire — pronto ad accendersi in H2.

interface Props {
  nomeBreve: string;
  famiglia?: "sicurezza" | "haccp";
  mostra: boolean;
  className?: string;
}

const STILE = {
  sicurezza: "bg-[#1e3a5f]/10 text-[#1e3a5f]",
  haccp: "bg-teal-100 text-teal-700",
} as const;

export default function BadgeModulo({ nomeBreve, famiglia = "sicurezza", mostra, className }: Props) {
  if (!mostra) return null;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STILE[famiglia]} ${className ?? ""}`}
    >
      {nomeBreve}
    </span>
  );
}
