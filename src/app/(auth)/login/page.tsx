import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Se già autenticato, vai direttamente alla dashboard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-[#1e3a5f]">
            SafeCheck
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Piattaforma sopralluoghi sicurezza sul lavoro
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-center text-base font-semibold text-gray-800">
            Accedi al tuo account
          </h2>
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          SafeCheck — D.Lgs. 81/2008
        </p>
      </div>
    </main>
  );
}
