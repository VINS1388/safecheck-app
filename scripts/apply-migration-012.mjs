/**
 * Applica supabase/migrations/012_sez08_multi_impresa.sql via pooler
 * aws-1-eu-central-1 (pg, no PAT) e verifica:
 *  - esistenza tabelle imprese_appalto / risposte_imprese_appalto + colonne
 *  - RLS abilitata su entrambe
 *  - template_master attivo: versione 4 + SEZ-08 con multi_impresa = true
 *
 * Uso: node scripts/apply-migration-012.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "012_sez08_multi_impresa.sql");

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
  console.log("✓ Migration 012 applicata.\n");

  for (const tbl of ["imprese_appalto", "risposte_imprese_appalto"]) {
    const { rows } = await c.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = $1 ORDER BY ordinal_position;`,
      [tbl]
    );
    const { rows: rls } = await c.query(
      `SELECT relrowsecurity FROM pg_class WHERE relname = $1;`,
      [tbl]
    );
    console.log(`Tabella ${tbl} (RLS=${rls[0]?.relrowsecurity}):`);
    for (const r of rows) {
      console.log(`  ${r.column_name}: ${r.data_type} ${r.is_nullable === "NO" ? "NOT NULL" : ""}`);
    }
    console.log("");
  }

  const { rows: sez } = await c.query(`
    SELECT s->>'id' AS sezione,
           (s->>'multi_impresa') AS multi_impresa
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') AS s
    WHERE tm.attivo = true AND s->>'id' = 'SEZ-08';
  `);
  const { rows: vers } = await c.query(
    `SELECT versione, struttura_json->>'versione' AS json_versione
       FROM template_master WHERE attivo = true;`
  );
  console.log("SEZ-08 marker:", JSON.stringify(sez[0]));
  console.log("Versione template_master:", JSON.stringify(vers[0]));
} finally {
  await c.end();
}
