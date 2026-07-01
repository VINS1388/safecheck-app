/**
 * Applica supabase/migrations/019_calcolo_automatico_scadenze.sql via pooler e
 * verifica: flag calcolo_automatico/periodicita_mesi/soglia_pc_giorni sulle 11
 * domande, campo_data su D-03-005/D-01-008, versione 8.
 *
 * Uso: node scripts/apply-migration-019.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "019_calcolo_automatico_scadenze.sql");

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
  console.log("✓ Migration 019 applicata.\n");

  const { rows } = await c.query(`
    SELECT s->>'id' AS sez, d->>'id' AS id,
           d->>'calcolo_automatico' AS ca,
           d->>'periodicita_mesi' AS pm,
           d->>'soglia_pc_giorni' AS spc,
           d->>'campo_data' AS cd
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') s,
         jsonb_array_elements(s->'domande') d
    WHERE tm.attivo = true AND (d->>'calcolo_automatico') = 'true'
    ORDER BY s->>'id', (d->>'ordine')::numeric;
  `);
  console.log("Domande a calcolo automatico:");
  for (const r of rows) {
    console.log(
      `  [${r.sez}] ${r.id}  periodicita=${r.pm}m  soglia_pc=${r.spc}gg  campo_data=${r.cd ?? "—"}`
    );
  }
  console.log(`\nTotale domande flaggate: ${rows.length} (atteso 11)`);

  const { rows: v } = await c.query(
    `SELECT versione, struttura_json->>'versione' AS jv FROM template_master WHERE attivo = true;`
  );
  console.log("Versione template_master:", JSON.stringify(v[0]));
} finally {
  await c.end();
}
