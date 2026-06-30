/**
 * Applica supabase/migrations/011_sez08_appalti_duvri.sql via pooler
 * aws-1-eu-central-1 (pg, no PAT) e verifica:
 *  - conteggio domande per sezione (atteso SEZ-08 = 9; totale 64)
 *  - presenza di domanda_filtro su SEZ-08 e del campo_extra testo_libero su D-08-003
 *  - versione template_master (colonna e JSON) = 3
 *
 * Uso: node scripts/apply-migration-011.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "011_sez08_appalti_duvri.sql");

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
  console.log("✓ Migration 011 applicata.\n");

  const { rows } = await c.query(`
    SELECT s->>'id' AS sezione,
           s->>'domanda_filtro' AS domanda_filtro,
           jsonb_array_length(s->'domande') AS n_domande
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') AS s
    WHERE tm.attivo = true
    ORDER BY (s->>'ordine')::int;
  `);
  let tot = 0;
  console.log("Conteggio domande template_master attivo:");
  for (const r of rows) {
    tot += Number(r.n_domande);
    const filt = r.domanda_filtro ? `  filtro=${r.domanda_filtro}` : "";
    console.log(`  ${r.sezione}: ${r.n_domande}${filt}`);
  }
  console.log(`  TOTALE: ${tot}`);

  const { rows: extra } = await c.query(`
    SELECT d->>'id' AS id,
           d->'campo_extra'->>'tipo' AS campo_extra_tipo,
           (d ? 'nota_ui') AS ha_nota_ui
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') s,
         jsonb_array_elements(s->'domande') d
    WHERE tm.attivo = true AND (s->>'id') = 'SEZ-08'
    ORDER BY (d->>'ordine')::int;
  `);
  console.log("\nSEZ-08 — campi speciali per domanda:");
  for (const r of extra) {
    console.log(
      `  ${r.id}  campo_extra=${r.campo_extra_tipo ?? "—"}  nota_ui=${r.ha_nota_ui ? "Y" : "n"}`
    );
  }

  const { rows: vers } = await c.query(
    `SELECT versione, struttura_json->>'versione' AS json_versione
       FROM template_master WHERE attivo = true;`
  );
  console.log("\nVersione template_master:", vers[0]);
} finally {
  await c.end();
}
