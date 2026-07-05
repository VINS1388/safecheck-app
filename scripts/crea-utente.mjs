// ⚠️ SOSTITUITO (Sprint 16 · Checkpoint 2): la creazione utenti è ora nell'area
//    /organizzazione (src/lib/server/organizzazione.ts → creaUtente). Questo
//    script CLI resta solo come utilità operativa/di emergenza; non è più il
//    percorso primario. Non cancellato in questo sprint (decisione rimandata).
/**
 * Crea (o allinea) un utente SafeCheck su Supabase, con parametri da CLI.
 *
 * - Legge URL e SERVICE_ROLE_KEY da .env.local (service role: bypassa la RLS)
 * - Crea l'utente in Supabase Auth con email già confermata
 * - Inserisce/aggiorna il profilo in public.utenti
 * - Idempotente: se l'utente esiste già, ne recupera l'id e allinea il profilo
 *
 * Uso:
 *   node scripts/crea-utente.mjs --email="nome@studio.it" --password="PasswordSicura123!" --nome="Nome Cognome" --ruolo="specialist"
 *
 * Parametri:
 *   --email      (obbligatorio)
 *   --password   (obbligatorio, min 8 caratteri)
 *   --nome       (obbligatorio)
 *   --ruolo      (obbligatorio: "admin" oppure "specialist")
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const RUOLI_VALIDI = ["admin", "specialist"];

// ── Parsing argomenti CLI: supporta --chiave=valore e --chiave valore ──
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const EMAIL = (args.email || "").trim();
const PASSWORD = args.password || "";
const NOME = (args.nome || "").trim();
const RUOLO = (args.ruolo || "").trim();

const errori = [];
if (!EMAIL || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(EMAIL)) errori.push("--email mancante o non valida");
if (!PASSWORD || PASSWORD.length < 8) errori.push("--password mancante o troppo corta (min 8)");
if (!NOME) errori.push("--nome mancante");
if (!RUOLI_VALIDI.includes(RUOLO)) errori.push(`--ruolo deve essere uno di: ${RUOLI_VALIDI.join(", ")}`);
if (errori.length) {
  console.error("✗ Parametri non validi:");
  for (const e of errori) console.error("  - " + e);
  console.error(
    '\nEsempio:\n  node scripts/crea-utente.mjs --email="nome@studio.it" --password="PasswordSicura123!" --nome="Nome Cognome" --ruolo="specialist"'
  );
  process.exit(1);
}

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
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  let userId;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
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
    { id: userId, email: EMAIL, nome_completo: NOME, ruolo: RUOLO, attivo: true },
    { onConflict: "id" }
  );
  if (upErr) throw upErr;

  const { data: profilo, error: selErr } = await supabase
    .from("utenti")
    .select("id, email, nome_completo, ruolo, attivo")
    .eq("id", userId)
    .single();
  if (selErr) throw selErr;

  console.log("\n✓ Utente pronto:");
  console.log(JSON.stringify(profilo, null, 2));
  console.log(`\nCredenziali: ${EMAIL} / (password impostata)`);
}

main().catch((e) => {
  console.error("\n✗ ERRORE:", e.message || e);
  process.exit(1);
});
