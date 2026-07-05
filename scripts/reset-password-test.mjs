/**
 * Reset password di account di TEST (dati fittizi) e verifica login.
 *
 * Tocca SOLO auth.users (updateUserById): NON modifica public.utenti, quindi
 * ruolo/attivo restano invariati (nessun rischio sul planner e nessun trigger
 * anti-escalation coinvolto). Verifica poi il login via anon key
 * (signInWithPassword), come farebbe l'app.
 *
 * Uso: node scripts/reset-password-test.mjs "<password>" email1 [email2 ...]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const PASSWORD = process.argv[2];
const EMAILS = process.argv.slice(3);
if (!PASSWORD || PASSWORD.length < 8 || EMAILS.length === 0) {
  console.error('Uso: node scripts/reset-password-test.mjs "<password>" email1 [email2 ...]');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

let allOk = true;
for (const email of EMAILS) {
  const user = await findUserByEmail(email);
  if (!user) { console.log(`✗ ${email}: utente Auth non trovato`); allOk = false; continue; }

  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true });
  if (updErr) { console.log(`✗ ${email}: reset fallito — ${updErr.message}`); allOk = false; continue; }

  // Verifica login come farebbe l'app (anon key + signInWithPassword)
  const anon = createClient(URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  const ruolo = (await admin.from("utenti").select("ruolo, attivo").eq("id", user.id).single()).data;
  if (signErr || !signIn?.session) {
    console.log(`✗ ${email}: password resettata ma login FALLITO — ${signErr?.message ?? "no session"}`);
    allOk = false;
  } else {
    console.log(`✓ ${email}: password resettata + login OK (ruolo=${ruolo?.ruolo} attivo=${ruolo?.attivo})`);
    await anon.auth.signOut().catch(() => {});
  }
}
process.exit(allOk ? 0 : 1);
