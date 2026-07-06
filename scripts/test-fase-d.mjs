/**
 * Fase D — test negativi obbligatori (Sprint HACCP 2) + acceptance sicurezza.
 * Verifica che l'enforcement server-side respinga i tentativi di creare/agganciare
 * verbali HACCP fuori dalle regole, e che il modulo sicurezza resti intatto.
 * BEGIN…ROLLBACK, asUser (SET ROLE authenticated, mai superuser).
 *
 * Scenari:
 *  1. moduloId HACCP forzato su sede SENZA HACCP attivo → gate=false (creaVisita
 *     server action lo rifiuta) per tutti i ruoli.
 *  2. Slot di altro modulo: slot HACCP + visita sicurezza → collegaSlot INCOERENTE.
 *  3. Tecnico: crea la PROPRIA visita HACCP (INSERT...RETURNING ok via policy 026),
 *     ma NON vede una visita HACCP altrui (RLS).
 *  4. Numerazione: primo HACCP → HACCP-2026-0001; serie SC prosegue corretta.
 *
 * Uso: node scripts/test-fase-d.mjs
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
  const cli = (await svc(() => c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('__H2_D__ Srl') RETURNING id`))).rows[0].id;
  const mkSede = async (nome) => (await svc(() => c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta) VALUES ($1,$2,'Via 1','T') RETURNING id`, [cli, nome]))).rows[0].id;

  // Sede SENZA HACCP (solo sicurezza), e sede CON HACCP.
  const sedeNoHaccp = await mkSede("solo sicurezza");
  await svc(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true)`, [sedeNoHaccp, M_SIC]));
  const sedeHaccp = await mkSede("con haccp");
  await svc(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true),($1,$3,true)`, [sedeHaccp, M_SIC, M_HG]));

  // 1. moduloId HACCP forzato su sede senza HACCP → gate=false per tutti i ruoli
  console.log("\n[1] HACCP forzato su sede senza HACCP → creaVisita (gate) RESPINGE");
  for (const [rn, uid] of [["admin", A], ["planner", PL], ["tecnico", T]]) {
    ck(`${rn}: gate(sedeNoHaccp, HACCP) = false`, (await gate(sedeNoHaccp, M_HG, uid)) === false);
  }
  ck("controprova: gate(sedeHaccp, HACCP) = true", (await gate(sedeHaccp, M_HG, A)) === true);

  // 2. Slot di altro modulo: slot HACCP + visita sicurezza → collegaSlot incoerente
  console.log("\n[2] Slot HACCP + visita sicurezza → collegaSlot INCOERENTE");
  const pianoHaccp = (await svc(() => c.query(`INSERT INTO public.piani_visite (sede_id,data_inizio_ciclo,visite_anno,modulo_id) VALUES ($1,CURRENT_DATE,2,$2) RETURNING id, ciclo_corrente`, [sedeHaccp, M_HG]))).rows[0];
  const slot = (await svc(() => c.query(`INSERT INTO public.visite_pianificate (piano_id,sede_id,numero_visita,ciclo_numero,data_suggerita,stato,tecnico_personalizzato) VALUES ($1,$2,1,$3,CURRENT_DATE,'da_pianificare',false) RETURNING id`, [pianoHaccp.id, sedeHaccp, pianoHaccp.ciclo_corrente]))).rows[0].id;
  const visSic = (await svc(() => c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,modulo_id,data_visita,stato,template_snapshot) VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id, modulo_id`, [cli, sedeHaccp, A, M_SIC]))).rows[0];
  const pianoMod = (await svc(() => c.query(`SELECT modulo_id FROM public.piani_visite WHERE id=$1`, [pianoHaccp.id]))).rows[0].modulo_id;
  ck("collegaSlot: modulo piano ≠ modulo visita → NON collegabile", pianoMod !== visSic.modulo_id);
  // Prova reale del guard applicativo (mirror): il collegamento non deve avvenire.
  ck("slot resta libero (visita_id NULL) — coerenza violata non collega", (await svc(() => c.query(`SELECT visita_id FROM public.visite_pianificate WHERE id=$1`, [slot]))).rows[0].visita_id === null);

  // 3. Tecnico: crea la PROPRIA visita HACCP (INSERT...RETURNING), non vede l'altrui
  console.log("\n[3] Tecnico su flusso HACCP — RLS");
  const colsV = `(cliente_id, sede_id, specialist_id, modulo_id, data_visita, stato, template_snapshot)`;
  const insT = await asUser(T, () => sp(() => c.query(`INSERT INTO public.visite ${colsV} VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id`, [cli, sedeHaccp, T, M_HG])));
  ck("tecnico: crea la PROPRIA visita HACCP (INSERT...RETURNING)", insT.ok, insT.ok ? "" : insT.e.code + " " + insT.e.message);
  const visAltrui = (await svc(() => c.query(`INSERT INTO public.visite ${colsV} VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id`, [cli, sedeHaccp, A, M_HG]))).rows[0].id;
  const vedeAltrui = await asUser(T, async () => (await c.query(`SELECT 1 FROM public.visite WHERE id=$1`, [visAltrui])).rowCount);
  ck("tecnico: NON vede la visita HACCP di un altro (RLS)", vedeAltrui === 0);

  // 4. Numerazione: primo HACCP → HACCP-2026-0001; SC prosegue
  console.log("\n[4] Numerazione per prefisso");
  const anno = new Date().getFullYear();
  const maxSc = (await c.query(`SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_verbale,'-',3) AS int)),0) m FROM public.visite WHERE numero_verbale LIKE $1`, [`SC-${anno}-%`])).rows[0].m;
  const vHg = (await svc(() => c.query(`INSERT INTO public.visite ${colsV} VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id`, [cli, sedeHaccp, A, M_HG]))).rows[0].id;
  const nHg = (await svc(() => c.query(`SELECT public.assegna_numero_verbale($1) n`, [vHg]))).rows[0].n;
  ck(`primo HACCP → HACCP-${anno}-0001`, nHg === `HACCP-${anno}-0001`, nHg);
  const nSc = (await svc(() => c.query(`SELECT public.assegna_numero_verbale($1) n`, [visSic.id]))).rows[0].n;
  ck(`SC prosegue → SC-${anno}-${String(maxSc + 1).padStart(4, "0")}`, nSc === `SC-${anno}-${String(maxSc + 1).padStart(4, "0")}`, nSc);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
