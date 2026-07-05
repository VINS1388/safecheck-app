/**
 * Fase C1 — enforcement server-side creazione (Sprint HACCP 2). Le funzioni app
 * (creaSede/creaVisita/salvaPiano/collegaSlot) usano la sessione Next: qui si
 * mirrorano le QUERY sottostanti con asUser (SET ROLE authenticated, mai
 * superuser). BEGIN…ROLLBACK.
 *
 * Copertura:
 *  1. creaSede: planner INSERT sede + INSERT moduli_sede(sicurezza) → la nuova
 *     sede è gate-passable per sicurezza (regressione: senza questo, il gate
 *     bloccherebbe il flusso sicurezza sulle sedi post-029).
 *  2. creaVisita gate — NEGATIVO: HACCP su sede senza HACCP attivo → gate=false
 *     (creaVisita rifiuta). POSITIVO: dopo attivazione HACCP dal planner → true.
 *  3. Tecnico non può attivare un modulo su una sede (RLS 42501).
 *  4. collegaSlot: coerenza modulo piano↔visita (mirror del check applicativo).
 *
 * Uso: node scripts/test-fase-c1-enforcement.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const M_SIC = "a0000000-0000-4000-8000-000000000001";
const M_HG = "a0000000-0000-4000-8000-000000000002";
function dbUrl() { for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i < 0) continue; if (l.slice(0, i).trim() === "DATABASE_URL") return l.slice(i + 1).trim().replace(/^["']|["']$/g, ""); } throw new Error("no url"); }
const c = new pg.Client({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}`, password: decodeURIComponent(new URL(dbUrl()).password), database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }
async function asUser(uid, fn) { await c.query(`SET LOCAL request.jwt.claims='${JSON.stringify({ sub: uid, role: "authenticated" })}'`); await c.query(`SET LOCAL ROLE authenticated`); try { return await fn(); } finally { try { await c.query(`RESET ROLE`); } catch {} } }
async function svc(fn) { await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`); await c.query(`RESET ROLE`); return fn(); }
async function sp(fn) { await c.query("SAVEPOINT s"); let r; try { r = { ok: true, v: await fn() }; } catch (e) { r = { ok: false, e }; } await c.query("ROLLBACK TO SAVEPOINT s"); await c.query("RELEASE SAVEPOINT s"); return r; }
const gate = (sede, mod, uid) => asUser(uid, async () => (await c.query(`SELECT public.can_creare_visita_con_modulo($1,$2) b`, [sede, mod])).rows[0].b);

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);
  const A = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const PL = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;
  const T = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const cli = (await svc(() => c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('__H2_C1__ Srl') RETURNING id`))).rows[0].id;

  // 1. creaSede path (planner): sede + moduli_sede(sicurezza) → gate sicurezza = true
  console.log("\n[1] creaSede semina moduli_sede(sicurezza) — nuova sede gate-passable");
  const insSede = await asUser(PL, () => sp(() => c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta) VALUES ($1,'C1 sede','Via 1','Testcity') RETURNING id`, [cli])));
  ck("planner: INSERT sede CONSENTITO (RLS)", insSede.ok && insSede.v.rows.length === 1, insSede.ok ? "" : insSede.e.code);
  // La sede della savepoint è annullata; per i passi successivi creo una sede persistente-in-tx via svc.
  const sede = (await svc(() => c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta) VALUES ($1,'C1 sede','Via 1','Testcity') RETURNING id`, [cli]))).rows[0].id;
  const insMs = await asUser(PL, () => sp(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true) RETURNING id`, [sede, M_SIC])));
  ck("planner: INSERT moduli_sede(sicurezza) CONSENTITO (RLS)", insMs.ok, insMs.ok ? "" : insMs.e.code);
  // Persisto la riga sicurezza in-tx (come farebbe creaSede) per i gate successivi.
  await svc(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true)`, [sede, M_SIC]));
  ck("gate(sede, sicurezza) = true → creaVisita sicurezza CONSENTITO", (await gate(sede, M_SIC, A)) === true);

  // 2. creaVisita gate HACCP — negativo poi positivo
  console.log("\n[2] Gate creaVisita HACCP — negativo/positivo");
  ck("NEGATIVO: HACCP su sede senza HACCP attivo → gate=false (creaVisita RIFIUTA)", (await gate(sede, M_HG, A)) === false);
  await svc(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true)`, [sede, M_HG]));
  ck("POSITIVO: dopo attivazione HACCP → gate=true (creaVisita CONSENTITO)", (await gate(sede, M_HG, A)) === true);
  // Il gate risponde identico per i 3 ruoli (SECURITY DEFINER).
  const perRuolo = [await gate(sede, M_HG, A), await gate(sede, M_HG, PL), await gate(sede, M_HG, T)];
  ck("gate identico per admin/planner/tecnico (DEFINER)", perRuolo.every((b) => b === true), perRuolo.join(" "));

  // 3. Tecnico non attiva moduli (RLS)
  console.log("\n[3] Attivazione modulo — solo admin/planner");
  const insT = await sp(() => asUser(T, () => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true) RETURNING id`, [sede, M_HG])));
  ck("tecnico: attivazione modulo NEGATA (RLS 42501)", !insT.ok && insT.e.code === "42501", insT.ok ? "consentito!" : insT.e.code);

  // 4. collegaSlot coerenza modulo (mirror del check applicativo piano↔visita)
  console.log("\n[4] collegaSlot — coerenza modulo piano↔visita");
  const pianoSic = (await svc(() => c.query(`INSERT INTO public.piani_visite (sede_id,data_inizio_ciclo,visite_anno,modulo_id) VALUES ($1,CURRENT_DATE,2,$2) RETURNING id, modulo_id`, [sede, M_SIC]))).rows[0];
  const mkVis = async (mod) => (await svc(() => c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,modulo_id,data_visita,stato,template_snapshot) VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id, modulo_id`, [cli, sede, A, mod]))).rows[0];
  const visHg = await mkVis(M_HG);
  const visSic = await mkVis(M_SIC);
  const coerente = (piano, vis) => piano.modulo_id === vis.modulo_id;
  ck("piano sicurezza + visita HACCP → INCOERENTE (collegaSlot rifiuta)", coerente(pianoSic, visHg) === false);
  ck("piano sicurezza + visita sicurezza → coerente (collegaSlot consente)", coerente(pianoSic, visSic) === true);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
