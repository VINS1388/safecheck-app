import Link from "next/link";

// PageHeader (Sprint 16.5 · S2). Ogni pagina oggi riassembla l'header a mano in
// due forme diverse (con drift di peso h1: font-bold vs font-semibold). Qui è
// una primitiva unica: back-link opzionale + titolo + sottotitolo + slot azioni.
// Peso h1 standardizzato a `font-semibold`.

interface Props {
  titolo: string;
  sottotitolo?: string;
  /** Link "indietro" opzionale (reso come "← etichetta" sopra il titolo). */
  backHref?: string;
  backLabel?: string;
  /** Azioni a destra (bottoni/Link). Su mobile vanno a capo sotto il titolo. */
  azioni?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  titolo,
  sottotitolo,
  backHref,
  backLabel = "Indietro",
  azioni,
  className,
}: Props) {
  return (
    <div className={`mb-6 ${className ?? ""}`}>
      {backHref && (
        <Link href={backHref} className="text-sm text-brand hover:underline">
          ← {backLabel}
        </Link>
      )}
      <div
        className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${
          backHref ? "mt-2" : ""
        }`}
      >
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{titolo}</h1>
          {sottotitolo && (
            <p className="mt-1 text-sm text-gray-500">{sottotitolo}</p>
          )}
        </div>
        {azioni && <div className="flex flex-wrap gap-2">{azioni}</div>}
      </div>
    </div>
  );
}
