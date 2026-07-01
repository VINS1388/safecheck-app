/**
 * Applica supabase/migrations/020_sprint14_lavoratori.sql via pooler e verifica:
 * D-03-001 con marker formazione_lavoratori + flag calcolo (periodicita 60,
 * soglia 60), versione template 9.
 *
 * ⚠️ ORDINE OBBLIGATORIO: eseguire SOLO DOPO il deploy del codice Sprint 14.
 * Applicare la 020 con il codice vecchio in produzione renderebbe D-03-001
 * inconsistente (calcolo_automatico senza gestione lavoratori).
 *
 * Uso: node scripts/apply-migration-020.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "020_sprint14_lavoratori.sql");

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
  const pre = (
    await c.query(`SELECT versione FROM template_master WHERE attivo = true`)
  ).rows[0]?.versione;
  if (pre !== 8) {
    console.log(`⚠️  versione attuale = ${pre} (attesa 8). La migration ha guard versione=8:`);
    console.log("    se è già 9 è un no-op; se diversa, verifica lo stato prima di procedere.");
  }

  await c.query(readFileSync(SQL_FILE, "utf8"));
  console.log("✓ Migration 020 applicata (o no-op se già v9).\n");

  const { rows } = await c.query(`
    SELECT d->>'id' AS id,
           d->>'formazione_lavoratori' AS fl,
           d->>'calcolo_automatico' AS ca,
           d->>'periodicita_mesi' AS pm,
           d->>'soglia_pc_giorni' AS spc,
           d->>'tipo_risposta' AS tipo,
           d->>'obbligatoria' AS obb
    FROM template_master tm,
         jsonb_array_elements(tm.struttura_json->'sezioni') s,
         jsonb_array_elements(s->'domande') d
    WHERE tm.attivo = true AND s->>'id' = 'SEZ-03' AND d->>'id' = 'D-03-001';
  `);
  console.log("D-03-001 (SEZ-03):");
  for (const r of rows) {
    console.log(
      `  formazione_lavoratori=${r.fl}  calcolo_automatico=${r.ca}  periodicita=${r.pm}m  soglia_pc=${r.spc}gg  tipo=${r.tipo}  obbligatoria=${r.obb}`
    );
  }

  const { rows: v } = await c.query(
    `SELECT versione, struttura_json->>'versione' AS jv FROM template_master WHERE attivo = true;`
  );
  console.log("\nVersione template_master:", JSON.stringify(v[0]), "(atteso 9)");
} finally {
  await c.end();
}
