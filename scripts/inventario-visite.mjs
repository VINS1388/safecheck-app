/**
 * PRE-GOLIVE FASE 2: inventario (sola lettura) di tutte le visite nel DB live.
 * NON elimina nulla. Uso: node scripts/inventario-visite.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";

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
  const { rows } = await c.query(`
    SELECT v.id,
           cl.ragione_sociale AS cliente,
           se.nome            AS sede,
           v.stato,
           v.numero_verbale,
           to_char(v.creata_il, 'YYYY-MM-DD HH24:MI') AS data_creazione
    FROM visite v
    LEFT JOIN clienti cl ON cl.id = v.cliente_id
    LEFT JOIN sedi se ON se.id = v.sede_id
    ORDER BY v.creata_il;
  `);
  console.log(`Visite totali nel DB: ${rows.length}\n`);
  console.table(rows);

  const perStato = await c.query(
    `SELECT stato, count(*)::int AS n FROM visite GROUP BY stato ORDER BY stato;`
  );
  console.log("\nConteggio per stato:");
  console.table(perStato.rows);

  const pdf = await c.query(`SELECT count(*)::int AS n FROM verbali_pdf;`);
  console.log("Record verbali_pdf:", pdf.rows[0].n);
} finally {
  await c.end();
}
