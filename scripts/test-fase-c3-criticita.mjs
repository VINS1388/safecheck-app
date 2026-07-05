/**
 * Fase C3 — il filtro criticità (≥1 NC) funziona INVARIATO sulle visite HACCP,
 * perché usa lo stesso enum su risposte.valore (mirror di visiteConNC). BEGIN…ROLLBACK.
 *
 * Uso: node scripts/test-fase-c3-criticita.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const M_HG = "a0000000-0000-4000-8000-000000000002";
function dbUrl() { for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i < 0) continue; if (l.slice(0, i).trim() === "DATABASE_URL") return l.slice(i + 1).trim().replace(/^["']|["']$/g, ""); } throw new Error("no url"); }
const c = new pg.Client({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}`, password: decodeURIComponent(new URL(dbUrl()).password), database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }

// mirror di visiteConNC (path standard): visite fra gli id con ≥1 risposta NC.
async function visiteConNC(ids) {
  const { rows } = await c.query(`SELECT DISTINCT visita_id FROM public.risposte WHERE valore='NC' AND visita_id = ANY($1)`, [ids]);
  return new Set(rows.map((r) => r.visita_id));
}

await c.connect();
try {
  await c.query("BEGIN");
  const A = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const cli = (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('__H2_CRIT__ Srl') RETURNING id`)).rows[0].id;
  const sede = (await c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta) VALUES ($1,'crit','Via 1','T') RETURNING id`, [cli])).rows[0].id;
  await c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true)`, [sede, M_HG]);

  const mkVis = async () => (await c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,modulo_id,data_visita,stato,template_snapshot) VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id`, [cli, sede, A, M_HG])).rows[0].id;
  const visNC = await mkVis();
  const visPulita = await mkVis();

  // Risposte HACCP: una NC sulla prima, solo C sulla seconda.
  await c.query(`INSERT INTO public.risposte (visita_id,domanda_id,sezione_id,valore,osservazione_evidenza) VALUES ($1,'D-H01-001','SEZ-H01','NC','manuale assente')`, [visNC]);
  await c.query(`INSERT INTO public.risposte (visita_id,domanda_id,sezione_id,valore) VALUES ($1,'D-H01-001','SEZ-H01','C')`, [visPulita]);

  const set = await visiteConNC([visNC, visPulita]);
  ck("visita HACCP con NC → nel filtro criticità", set.has(visNC));
  ck("visita HACCP con sole C → FUORI dal filtro criticità", !set.has(visPulita));

  // Enum invariato: NC su HACCP è memorizzato come lo stesso valore enum.
  const val = (await c.query(`SELECT valore FROM public.risposte WHERE visita_id=$1`, [visNC])).rows[0].valore;
  ck("risposte.valore = 'NC' (stesso enum del verbale sicurezza)", val === "NC");

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
