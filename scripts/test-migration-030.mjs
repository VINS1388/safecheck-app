/**
 * Test Migration 030 (Sprint HACCP 2 · C4) sullo stato LIVE. Colonna
 * intestazione_extra: presenza/tipo/backfill, scrittura RLS del tecnico-owner,
 * verbale sicurezza invariato, copia in clona_visita. BEGIN…ROLLBACK.
 *
 * Uso: node scripts/test-migration-030.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const M_HG = "a0000000-0000-4000-8000-000000000002";
const M_SIC = "a0000000-0000-4000-8000-000000000001";
function dbUrl() { for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i < 0) continue; if (l.slice(0, i).trim() === "DATABASE_URL") return l.slice(i + 1).trim().replace(/^["']|["']$/g, ""); } throw new Error("no url"); }
const c = new pg.Client({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}`, password: decodeURIComponent(new URL(dbUrl()).password), database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }
async function asUser(uid, fn) { await c.query(`SET LOCAL request.jwt.claims='${JSON.stringify({ sub: uid, role: "authenticated" })}'`); await c.query(`SET LOCAL ROLE authenticated`); try { return await fn(); } finally { try { await c.query(`RESET ROLE`); } catch {} } }
async function svc(fn) { await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`); await c.query(`RESET ROLE`); return fn(); }

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

  // 1. Colonna
  const col = (await c.query(`SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='visite' AND column_name='intestazione_extra'`)).rows[0];
  ck("colonna jsonb NOT NULL default {}", col && col.data_type === "jsonb" && col.is_nullable === "NO" && col.column_default === "'{}'::jsonb", JSON.stringify(col));

  // 2. Backfill
  const nulle = (await c.query(`SELECT count(*)::int n FROM public.visite WHERE intestazione_extra IS NULL`)).rows[0].n;
  ck("nessuna visita con intestazione_extra NULL (backfill)", nulle === 0);

  const T = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const cli = (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('__H2_030__ Srl') RETURNING id`)).rows[0].id;
  const sede = (await c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta) VALUES ($1,'s','Via 1','T') RETURNING id`, [cli])).rows[0].id;
  await c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true)`, [sede, M_HG]);

  // 3. Scrittura RLS: il tecnico-owner aggiorna intestazione_extra della propria visita
  const vHg = (await svc(() => c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,modulo_id,data_visita,stato,template_snapshot) VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id`, [cli, sede, T, M_HG]))).rows[0].id;
  const payload = { ora_fine: "12:30", funzione_referente: "Titolare", aree_visitate: ["cucina", "cella"], flag_rilievi_fotografici: true };
  const upd = await asUser(T, () => c.query(`UPDATE public.visite SET intestazione_extra=$2 WHERE id=$1 RETURNING intestazione_extra`, [vHg, JSON.stringify(payload)]));
  ck("tecnico-owner: UPDATE intestazione_extra consentito", upd.rowCount === 1);
  const read = (await asUser(T, () => c.query(`SELECT intestazione_extra e FROM public.visite WHERE id=$1`, [vHg]))).rows[0].e;
  ck("JSONB riletto correttamente", read && read.funzione_referente === "Titolare" && read.aree_visitate.length === 2 && read.flag_rilievi_fotografici === true);

  // 4. Verbale sicurezza: intestazione_extra resta {}
  const vSic = (await svc(() => c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,modulo_id,data_visita,stato,template_snapshot) VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id, intestazione_extra`, [cli, sede, T, M_SIC]))).rows[0];
  ck("visita sicurezza: intestazione_extra = {} di default", JSON.stringify(vSic.intestazione_extra) === "{}");

  // 5. clona_visita copia intestazione_extra
  const src = (await svc(() => c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,modulo_id,data_visita,stato,stato_verbale,numero_verbale,intestazione_extra,template_snapshot) VALUES ($1,$2,$3,$4,CURRENT_DATE,'verbale_generato','chiuso','HACCP-9999-0001',$5,'{}'::jsonb) RETURNING id`, [cli, sede, T, M_HG, JSON.stringify(payload)]))).rows[0].id;
  const cloneId = (await svc(() => c.query(`SELECT public.clona_visita($1,false) id`, [src]))).rows[0].id;
  const cloneExtra = (await svc(() => c.query(`SELECT intestazione_extra e FROM public.visite WHERE id=$1`, [cloneId]))).rows[0].e;
  ck("clona_visita: il clone eredita intestazione_extra del sorgente", cloneExtra && cloneExtra.funzione_referente === "Titolare" && cloneExtra.ora_fine === "12:30");

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
