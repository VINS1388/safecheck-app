/**
 * Applica supabase/migrations/016_sez01_sorveglianza_sanitaria.sql via pooler
 * e verifica: 3 nuove domande gate in SEZ-01, marker campo_data su D-01-016,
 * versione 6.
 *
 * Uso: node scripts/apply-migration-016.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "016_sez01_sorveglianza_sanitaria.sql");

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
  console.log("✓ Migration 016 applicata.\n");

  const { rows } = await c.query(`
    SELECT d->>'id' AS id, d->>'ordine' AS ord,
           d->>'gated_by' AS gated_by,
           d->'gate_collassa_su' AS collassa,
           d->>'campo_data' AS campo_data
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') s,
         jsonb_array_elements(s->'domande') d
    WHERE tm.attivo = true AND s->>'id' = 'SEZ-01'
      AND d->>'id' IN ('D-01-012','D-01-014','D-01-015','D-01-016')
    ORDER BY (d->>'ordine')::numeric;
  `);
  console.log("SEZ-01 — filtro + sotto-sezione sorveglianza:");
  for (const r of rows) {
    console.log(
      `  ${r.id} [ord ${r.ord}]  gated_by=${r.gated_by ?? "—"}  collassa=${r.collassa ?? "—"}  campo_data=${r.campo_data ?? "—"}`
    );
  }

  const { rows: n } = await c.query(`
    SELECT jsonb_array_length(s->'domande') AS n
    FROM template_master tm, jsonb_array_elements(tm.struttura_json->'sezioni') s
    WHERE tm.attivo = true AND s->>'id' = 'SEZ-01';
  `);
  console.log("\nSEZ-01 totale domande:", n[0].n, "(era 13 → atteso 16)");

  const { rows: v } = await c.query(
    `SELECT versione, struttura_json->>'versione' AS jv FROM template_master WHERE attivo = true;`
  );
  console.log("Versione template_master:", JSON.stringify(v[0]));
} finally {
  await c.end();
}
