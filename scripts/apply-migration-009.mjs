/**
 * Applica supabase/migrations/009_descrizione_domanda.sql via pooler
 * aws-1-eu-central-1 (pg, no PAT) e verifica la migrazione note_tecnico→descrizione.
 *
 * Uso: node scripts/apply-migration-009.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "009_descrizione_domanda.sql");

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
  console.log("✓ Migration 009 applicata.\n");

  const { rows } = await c.query(`
    SELECT d->>'id' AS id,
           (d ? 'descrizione') AS ha_descrizione,
           (d ? 'note_tecnico') AS ha_note_tecnico,
           (d ? 'rif_normativo') AS ha_rif,
           left(d->>'descrizione', 60) AS descrizione_preview
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') s,
         jsonb_array_elements(s->'domande') d
    WHERE tm.attivo = true AND (s->>'id') IN ('SEZ-01','SEZ-06')
    ORDER BY (s->>'id'), (d->>'ordine')::int;
  `);
  console.log("SEZ-01 / SEZ-06 — stato campi per domanda:");
  for (const r of rows) {
    const flag = r.ha_rif ? (r.ha_descrizione && !r.ha_note_tecnico ? "✓ migrata" : "✗ ANOMALIA") : "— invariata";
    console.log(
      `  ${r.id}  rif=${r.ha_rif ? "Y" : "n"}  descr=${r.ha_descrizione ? "Y" : "n"}  note=${r.ha_note_tecnico ? "Y" : "n"}  ${flag}`
    );
  }

  const { rows: tot } = await c.query(`
    SELECT count(*) FILTER (WHERE (d ? 'rif_normativo')) AS con_rif,
           count(*) FILTER (WHERE (d ? 'rif_normativo') AND (d ? 'descrizione') AND NOT (d ? 'note_tecnico')) AS migrate_ok,
           count(*) FILTER (WHERE NOT (d ? 'rif_normativo') AND (d ? 'note_tecnico')) AS note_intatte
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') s,
         jsonb_array_elements(s->'domande') d
    WHERE tm.attivo = true;
  `);
  console.log("\nRiepilogo template attivo:", tot[0]);
} finally {
  await c.end();
}
