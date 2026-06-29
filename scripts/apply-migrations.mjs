/**
 * Applica le migration SQL di supabase/migrations/ in ordine, in un'unica
 * transazione (rollback totale in caso di errore), su un database Postgres.
 *
 * Pensato come alternativa a `supabase db push` quando si vuole applicare
 * direttamente via connection string (es. da CI o in locale).
 *
 * Uso:
 *   node scripts/apply-migrations.mjs
 *     -> usa DATABASE_URL da .env.local (o env)
 *   node scripts/apply-migrations.mjs "postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres"
 *     -> usa la connection string passata (consigliato: pooler in SESSION mode, porta 5432)
 *
 * Requisiti: dipendenza `pg` (devDependency).
 * Nota: applica le migration SENZA registrarle in supabase_migrations.schema_migrations;
 * se in seguito userai `supabase db push`, allinea lo stato con `supabase migration repair`.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

function loadDbUrl() {
  if (process.argv[2]) return process.argv[2].trim();
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  const envLocal = join(ROOT, ".env.local");
  if (existsSync(envLocal)) {
    const m = readFileSync(envLocal, "utf8").match(
      /^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m
    );
    if (m) return m[1].trim();
  }
  throw new Error(
    "Connection string mancante: passala come argomento o imposta DATABASE_URL."
  );
}

const connectionString = loadDbUrl();
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("Connesso a:", connectionString.replace(/:[^:@/]+@/, ":***@"));

  const exists = await client.query("SELECT to_regclass('public.utenti') AS t");
  if (exists.rows[0].t) {
    console.error(
      "ATTENZIONE: 'public.utenti' esiste già — migration probabilmente già applicate. Interrompo."
    );
    await client.end();
    process.exit(2);
  }

  try {
    await client.query("BEGIN");
    for (const f of files) {
      console.log(`>>> ${f}`);
      await client.query(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    }
    await client.query("COMMIT");
    console.log("✓ Migration applicate (COMMIT).");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("✗ ROLLBACK:", e.message);
    await client.end();
    process.exit(1);
  }

  const cnt = await client.query(
    `SELECT (SELECT SUM(jsonb_array_length(s->'domande'))
               FROM jsonb_array_elements(struttura_json->'sezioni') s) AS domande
       FROM template_master WHERE versione = 1`
  );
  console.log(`Seed template_master: ${cnt.rows[0].domande} domande.`);

  await client.end();
}

main().catch(async (e) => {
  console.error("ERRORE:", e.message);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
