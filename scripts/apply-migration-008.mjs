/**
 * Applica supabase/migrations/008_template_sez01_sez06_rev.sql al progetto
 * Supabase tramite il pooler aws-1-eu-central-1 (pg, no PAT) e verifica il
 * conteggio domande per sezione del template_master attivo.
 *
 * Uso: node scripts/apply-migration-008.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "008_template_sez01_sez06_rev.sql");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  const envLocal = join(ROOT, ".env.local");
  if (existsSync(envLocal)) {
    for (const line of readFileSync(envLocal, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i === -1) continue;
      const k = line.slice(0, i).trim();
      if (k === "DATABASE_URL") {
        return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  throw new Error("DATABASE_URL mancante in .env.local");
}

function poolerConfig(dbUrl) {
  // Estrae la password dal DATABASE_URL (host diretto, solo IPv6 da qui) e la
  // ricompone verso il pooler IPv4 aws-1-eu-central-1.
  const u = new URL(dbUrl);
  const password = decodeURIComponent(u.password);
  return {
    host: "aws-1-eu-central-1.pooler.supabase.com",
    port: 5432,
    user: `postgres.${REF}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  };
}

async function main() {
  const client = new pg.Client(poolerConfig(loadDatabaseUrl()));
  await client.connect();
  try {
    await client.query(readFileSync(SQL_FILE, "utf8"));
    console.log("✓ Migration 008 applicata.");

    const { rows } = await client.query(`
      SELECT s->>'id' AS sezione,
             jsonb_array_length(s->'domande') AS n_domande
      FROM template_master tm,
           jsonb_array_elements(tm.struttura_json->'sezioni') AS s
      WHERE tm.attivo = true
      ORDER BY (s->>'ordine')::int;
    `);
    let tot = 0;
    console.log("\nConteggio domande template_master attivo:");
    for (const r of rows) {
      tot += Number(r.n_domande);
      console.log(`  ${r.sezione}: ${r.n_domande}`);
    }
    console.log(`  TOTALE: ${tot}`);

    const { rows: vers } = await client.query(
      `SELECT versione, struttura_json->>'versione' AS json_versione
         FROM template_master WHERE attivo = true;`
    );
    console.log("\nVersione template_master:", vers[0]);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("✗ ERRORE:", e.message || e);
  process.exit(1);
});
