/**
 * Applica supabase/migrations/004_trigger_new_user.sql al progetto Supabase
 * tramite Management API (POST /v1/projects/{ref}/database/query).
 *
 * Token: SUPABASE_ACCESS_TOKEN, letto da .env.local o dall'ambiente.
 * Uso: node scripts/apply-migration-004.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "004_trigger_new_user.sql");

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

async function main() {
  const token = loadToken();
  const query = readFileSync(SQL_FILE, "utf8");

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  console.log("✓ Migration 004 applicata.");

  // Verifica: trigger presente su auth.users
  const verify = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `SELECT tgname FROM pg_trigger
                WHERE tgname = 'on_auth_user_created' AND NOT tgisinternal;`,
      }),
    }
  );
  const rows = await verify.json();
  console.log(
    "Trigger presente:",
    Array.isArray(rows) && rows.length > 0 ? rows[0].tgname : "NON trovato"
  );
}

main().catch((e) => {
  console.error("✗ ERRORE:", e.message || e);
  process.exit(1);
});
