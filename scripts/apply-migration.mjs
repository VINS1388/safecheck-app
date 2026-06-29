/**
 * Applica una migration SQL al progetto Supabase via Management API.
 *
 * Token: SUPABASE_ACCESS_TOKEN (PAT), da .env.local o ambiente.
 * Uso: node scripts/apply-migration.mjs <nome-file-in-supabase/migrations>
 *   es. node scripts/apply-migration.mjs 006_visite_avvio.sql
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REF = "yrgpowaflmcwwspffjip";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Uso: node scripts/apply-migration.mjs <file.sql>");
  process.exit(1);
}
const SQL_FILE = join(ROOT, "supabase", "migrations", fileArg);

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
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: readFileSync(SQL_FILE, "utf8") }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  console.log(`✓ Migration ${fileArg} applicata.`);
}

main().catch((e) => {
  console.error("✗ ERRORE:", e.message || e);
  process.exit(1);
});
