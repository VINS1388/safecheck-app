import Link from "next/link";

// Empty-state condiviso (Sprint 15.1): messaggio chiaro + call-to-action
// pertinente. Mai un silenzio visivo, mai un errore.

interface Props {
  titolo: string;
  descrizione?: string;
  ctaHref?: string;
  ctaLabel?: string;
  compatto?: boolean;
}

export default function EmptyState({ titolo, descrizione, ctaHref, ctaLabel, compatto }: Props) {
  return (
    <div
      className={`rounded-xl border border-dashed border-gray-300 bg-white text-center ${
        compatto ? "px-4 py-6" : "px-6 py-10"
      }`}
    >
      <p className="text-sm font-medium text-gray-900">{titolo}</p>
      {descrizione && <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{descrizione}</p>}
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-4 inline-block min-h-[40px] rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#16304e]"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
