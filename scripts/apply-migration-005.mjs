/**
 * Applica supabase/migrations/005_numero_verbale_sc.sql al progetto Supabase
 * tramite Management API (POST /v1/projects/{ref}/database/query).
 *
 * Token: SUPABASE_ACCESS_TOKEN, letto da .env.local o dall'ambiente.
 * Uso: node scripts/apply-migration-005.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "005_numero_verbale_sc.sql");

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const envLocal = join(ROOT, ".env.local");
  if (existsSync(envLocal)) {
    const m = readFileSync(envLocal, "utf8").match(
      /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*"?([^"\n]+)"?/m
    );
    if (m) return m[1].trim();
  }
  throw new Error(
    "SUPABASE_ACCESS_TOKEN mancante (impostalo in .env.local o nell'ambiente)."
  );
}

async function query(token, sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text;
}

async function main() {
  const token = loadToken();
  await query(token, readFileSync(SQL_FILE, "utf8"));
  console.log("✓ Migration 005 applicata.");

  // Verifica: esegue la funzione in dry-run su un id inesistente per leggere il prefisso.
  const out = await query(
    token,
    `SELECT prosrc FROM pg_proc WHERE proname = 'assegna_numero_verbale';`
  );
  console.log("Prefisso SC- presente nella funzione:", out.includes("SC-"));
}

main().catch((e) => {
  console.error("✗ ERRORE:", e.message || e);
  process.exit(1);
});
