/**
 * Applica supabase/migrations/017_blocco_sorveglianza_nomina_mc.sql via pooler
 * e verifica (STEP 1d): D-01-002 (nomina MC) entra nel blocco gate D-01-012 come
 * prima domanda; 4 domande gated; versione 7.
 *
 * Uso: node scripts/apply-migration-017.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "017_blocco_sorveglianza_nomina_mc.sql");

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
  const res = await c.query(readFileSync(SQL_FILE, "utf8"));
  console.log(`✓ Migration 017 applicata (righe aggiornate: ${res.rowCount ?? 0}).\n`);

  // STEP 1d — filtro + tutte le domande gate da D-01-012, in ordine.
  const { rows } = await c.query(`
    SELECT d->>'id' AS id, d->>'ordine' AS ordine,
           d->>'gated_by' AS gated_by,
           d->'gate_collassa_su' AS gate_collassa_su,
           d->>'testo' AS testo
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') s,
         jsonb_array_elements(s->'domande') d
    WHERE tm.attivo = true AND s->>'id' = 'SEZ-01'
      AND (d->>'gated_by' = 'D-01-012' OR d->>'id' = 'D-01-012')
    ORDER BY (d->>'ordine')::numeric;
  `);
  console.log("SEZ-01 — D-01-012 (gate) + domande condizionali:");
  for (const r of rows) {
    console.log(
      `  ${r.id} [ord ${String(r.ordine).padEnd(4)}] gated_by=${(r.gated_by ?? "—").padEnd(10)} collassa=${r.gate_collassa_su ?? "—"}` +
      `  "${r.testo.slice(0, 70)}${r.testo.length > 70 ? "…" : ""}"`
    );
  }

  const gated = rows.filter((r) => r.gated_by === "D-01-012").length;
  console.log(`\nDomande gated_by=D-01-012: ${gated} (atteso 4)`);

  const { rows: n } = await c.query(`
    SELECT jsonb_array_length(s->'domande') AS n
    FROM template_master tm, jsonb_array_elements(tm.struttura_json->'sezioni') s
    WHERE tm.attivo = true AND s->>'id' = 'SEZ-01';
  `);
  console.log("SEZ-01 totale domande:", n[0].n, "(invariato: atteso 16)");

  const { rows: v } = await c.query(
    `SELECT versione, struttura_json->>'versione' AS jv FROM template_master WHERE attivo = true;`
  );
  console.log("Versione template_master:", JSON.stringify(v[0]), "(atteso 7)");
} finally {
  await c.end();
}
