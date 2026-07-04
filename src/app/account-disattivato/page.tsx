import { logoutAction } from "@/app/(auth)/login/actions";

/**
 * Pagina di accesso negato per utenti disattivati (Q4, Sprint 16). Il gate del
 * layout (dashboard) reindirizza qui gli utenti con attivo=false. Sta FUORI dal
 * gruppo (dashboard) per non entrare in loop di redirect.
 */
export default function AccountDisattivatoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Account disattivato</h1>
        <p className="mt-2 text-sm text-gray-600">
          Il tuo account è stato disattivato e non può accedere a SafeCheck.
          Contatta l’amministratore dello studio per riattivarlo.
        </p>
        <form action={logoutAction} className="mt-5">
          <button
            type="submit"
            className="min-h-[44px] w-full rounded-lg bg-[#1e3a5f] px-4 text-sm font-semibold text-white transition hover:bg-[#16304e]"
          >
            Esci
          </button>
        </form>
      </div>
    </main>
  );
}
