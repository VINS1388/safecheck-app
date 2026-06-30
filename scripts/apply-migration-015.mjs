/**
 * Applica supabase/migrations/015_sez03_formazione_per_nominativo.sql via pooler
 * e verifica: marker SEZ-03, figura_nominativo sulle 8 domande, versione 5.
 *
 * Uso: node scripts/apply-migration-015.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "015_sez03_formazione_per_nominativo.sql");

function dbUrl() {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === "DATABASE_URL")
      return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("no DATABASE_URL");
}

const u = new URL(dbUrl());
const c = new pg.Client({
  host: "aws-1-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${REF}`,
  password: decodeURIComponent(u.password),
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await c.connect();
try {
  await c.query(readFileSync(SQL_FILE, "utf8"));
  console.log("✓ Migration 015 applicata.\n");

  const { rows: sez } = await c.query(`
    SELECT s->>'formazione_per_nominativo' AS marker
    FROM template_master tm, jsonb_array_elements(tm.struttura_json->'sezioni') s
    WHERE tm.attivo = true AND s->>'id' = 'SEZ-03';
  `);
  console.log("SEZ-03 formazione_per_nominativo:", sez[0]?.marker);

  const { rows: d } = await c.query(`
    SELECT d->>'id' AS id, d->>'figura_nominativo' AS figura
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') s,
         jsonb_array_elements(s->'domande') d
    WHERE tm.attivo = true AND s->>'id' = 'SEZ-03'
    ORDER BY (d->>'ordine')::int;
  `);
  console.log("\nSEZ-03 domande → figura:");
  for (const r of d) console.log(`  ${r.id}: ${r.figura ?? "(generica)"}`);

  const { rows: v } = await c.query(
    `SELECT versione, struttura_json->>'versione' AS jv FROM template_master WHERE attivo = true;`
  );
  console.log("\nVersione template_master:", JSON.stringify(v[0]));
} finally {
  await c.end();
}
