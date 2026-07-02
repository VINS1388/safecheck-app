// Loading state condiviso delle route dashboard (Sprint 15.1): spinner sobrio,
// coerente in tutto il prodotto.
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#1e3a5f]"
        role="status"
        aria-label="Caricamento"
      />
    </div>
  );
}
