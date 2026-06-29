/**
 * Crea il primo utente amministratore su Supabase.
 *
 * - Legge URL e SERVICE_ROLE_KEY da .env.local
 * - Crea l'utente in Supabase Auth (email già confermata)
 * - Inserisce/aggiorna il profilo in public.utenti con ruolo 'admin'
 *
 * Idempotente: se l'utente esiste già, ne recupera l'id e allinea il profilo.
 *
 * Uso: node scripts/crea-utente-admin.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const EMAIL = "admin@safecheck.local";
const PASSWORD = "SafeCheck2026!";
const NOME = "Amministratore SafeCheck";
const RUOLO = "admin";

function loadEnv() {
  const env = {};
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // pagina sugli utenti finché trovi l'email (di norma è nella prima pagina)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  let userId;

  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nome_completo: NOME, ruolo: RUOLO },
    });

  if (createErr) {
    const msg = (createErr.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      console.log("Utente Auth già esistente — recupero id e allineo il profilo.");
      const existing = await findUserByEmail(EMAIL);
      if (!existing) throw new Error("Utente esistente ma non trovato via listUsers");
      userId = existing.id;
      // assicura password e metadata corretti
      await supabase.auth.admin.updateUserById(userId, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { nome_completo: NOME, ruolo: RUOLO },
      });
    } else {
      throw createErr;
    }
  } else {
    userId = created.user.id;
    console.log("Utente Auth creato:", userId);
  }

  // Upsert profilo in public.utenti (service role bypassa la RLS)
  const { error: upErr } = await supabase.from("utenti").upsert(
    {
      id: userId,
      email: EMAIL,
      nome_completo: NOME,
      ruolo: RUOLO,
      attivo: true,
    },
    { onConflict: "id" }
  );
  if (upErr) throw upErr;

  // Verifica finale
  const { data: profilo, error: selErr } = await supabase
    .from("utenti")
    .select("id, email, nome_completo, ruolo, attivo")
    .eq("id", userId)
    .single();
  if (selErr) throw selErr;

  console.log("\n✓ Admin pronto:");
  console.log(JSON.stringify(profilo, null, 2));
  console.log(`\nCredenziali: ${EMAIL} / ${PASSWORD}`);
}

main().catch((e) => {
  console.error("\n✗ ERRORE:", e.message || e);
  process.exit(1);
});
