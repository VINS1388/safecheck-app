/**
 * Test funzionale Migration 029 (Sprint HACCP 2 · Fase B) sullo stato LIVE di prod
 * (029 già applicata). Tutte le fixture sono create in transazione e annullate:
 * BEGIN…ROLLBACK, SET ROLE authenticated (mai superuser per i check di ruolo),
 * asUser(ruolo-reale). Nessuna modifica persistita.
 *
 * Copertura:
 *  1. DEFAULT rimosso: INSERT senza modulo_id su visite/piani/template -> 23502.
 *  2. can_creare_visita_con_modulo: matrice (catalogo × sede) × 3 ruoli, incluso
 *     il caso "sede non raggiungibile via RLS dal tecnico" (proprietà DEFINER).
 *  3. Template HACCP: deep-equal byte-fedele contro il file canonico.
 *  4. retail/collettiva non attivabili.
 *  5. Numerazione: SC prosegue corretta; primo HACCP -> HACCP-2026-0001.
 *
 * Uso: node scripts/test-migration-029.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const M_SIC = "a0000000-0000-4000-8000-000000000001";
const M_HG = "a0000000-0000-4000-8000-000000000002";
const M_RET = "a0000000-0000-4000-8000-000000000003";

function dbUrl() {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === "DATABASE_URL") return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("no DATABASE_URL");
}
const u = new URL(dbUrl());
const c = new pg.Client({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}`, password: decodeURIComponent(u.password), database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });

let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }
async function asUser(uid, fn) { await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`); await c.query(`SET LOCAL ROLE authenticated`); try { return await fn(); } finally { await c.query(`RESET ROLE`); } }
async function svc(fn) { await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`); await c.query(`RESET ROLE`); return fn(); }
async function sp(fn) { await c.query("SAVEPOINT s"); try { const r = await fn(); await c.query("RELEASE SAVEPOINT s"); return { ok: true, v: r }; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); await c.query("RELEASE SAVEPOINT s"); return { ok: false, e }; } }
async function callBool(sede, modulo, uid) { return asUser(uid, async () => (await c.query(`SELECT public.can_creare_visita_con_modulo($1,$2) b`, [sede, modulo])).rows[0].b); }

function deepEqual(a, b, path = "$") {
  if (a === b) return null;
  if (typeof a !== typeof b) return `${path}: tipo ${typeof a} != ${typeof b}`;
  if (a === null || b === null) return `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${path}: array mismatch`;
    if (a.length !== b.length) return `${path}: len ${a.length} != ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = deepEqual(a[i], b[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  if (typeof a === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return `${path}: chiavi {${ka}} != {${kb}}`;
    for (const k of ka) { const d = deepEqual(a[k], b[k], `${path}.${k}`); if (d) return d; }
    return null;
  }
  return `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

  const A = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
  const T = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
  const PL = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;

  // Fixture: cliente + 3 sedi (service role). Rollback a fine test.
  const cli = (await svc(() => c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('__H2_TEST__ Srl') RETURNING id`))).rows[0].id;
  const mkSede = async (nome) => (await svc(() => c.query(`INSERT INTO public.sedi (cliente_id,nome,indirizzo,citta) VALUES ($1,$2,'Via Test 1','Testcity') RETURNING id`, [cli, nome]))).rows[0].id;
  const sedeOn = await mkSede("HG attivo");
  const sedeOff = await mkSede("HG spento");
  const sedeNone = await mkSede("HG assente");
  await svc(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true)`, [sedeOn, M_HG]));
  await svc(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,false)`, [sedeOff, M_HG]));
  await svc(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true)`, [sedeOn, M_SIC])); // sicurezza attivo su sedeOn
  await svc(() => c.query(`INSERT INTO public.moduli_sede (sede_id,modulo_id,attivo) VALUES ($1,$2,true)`, [sedeOn, M_RET])); // retail attivo su sede MA catalogo spento

  // --- 1. DEFAULT rimosso: INSERT senza modulo_id deve fallire (23502 su modulo_id) ---
  console.log("\n[1] DEFAULT rimosso — INSERT senza modulo_id");
  const negVis = await svc(() => sp(() => c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,data_visita,stato,template_snapshot) VALUES ($1,$2,$3,CURRENT_DATE,'bozza','{}'::jsonb)`, [cli, sedeOn, A])));
  ck("visite senza modulo_id -> 23502 su modulo_id", !negVis.ok && negVis.e.code === "23502" && negVis.e.column === "modulo_id", negVis.ok ? "INSERITA!" : `${negVis.e.code}/${negVis.e.column}`);
  const negPia = await svc(() => sp(() => c.query(`INSERT INTO public.piani_visite (sede_id,data_inizio_ciclo,visite_anno) VALUES ($1,CURRENT_DATE,2)`, [sedeNone])));
  ck("piani_visite senza modulo_id -> 23502 su modulo_id", !negPia.ok && negPia.e.code === "23502" && negPia.e.column === "modulo_id", negPia.ok ? "INSERITO!" : `${negPia.e.code}/${negPia.e.column}`);
  const negTmp = await svc(() => sp(() => c.query(`INSERT INTO public.template_master (nome,struttura_json,versione) VALUES ('__x__','{}'::jsonb,9999)`)));
  ck("template_master senza modulo_id -> 23502 su modulo_id", !negTmp.ok && negTmp.e.code === "23502" && negTmp.e.column === "modulo_id", negTmp.ok ? "INSERITO!" : `${negTmp.e.code}/${negTmp.e.column}`);

  // --- 2. can_creare_visita_con_modulo: matrice × 3 ruoli ---
  console.log("\n[2] can_creare_visita_con_modulo (matrice × ruoli)");
  const roles = [["admin", A], ["planner", PL], ["tecnico", T]];
  const expect = [
    ["HG catalogo+sede attivi", sedeOn, M_HG, true],
    ["HG sede spenta", sedeOff, M_HG, false],
    ["HG sede senza riga", sedeNone, M_HG, false],
    ["retail attivo su sede ma catalogo spento", sedeOn, M_RET, false],
    ["sicurezza catalogo+sede attivi", sedeOn, M_SIC, true],
  ];
  for (const [label, sede, mod, exp] of expect) {
    const results = [];
    for (const [rn, uid] of roles) results.push([rn, await callBool(sede, mod, uid)]);
    const allExp = results.every(([, b]) => b === exp);
    const same = results.every(([, b]) => b === results[0][1]);
    ck(`${label} -> ${exp} per tutti i ruoli`, allExp && same, results.map(([rn, b]) => `${rn}=${b}`).join(" "));
  }
  // Proprietà DEFINER: il tecnico NON raggiunge sedeOn via RLS, ma il gate risponde true.
  const tecnicoVedeSede = await asUser(T, async () => (await c.query(`SELECT public.can_access_sede($1) b`, [sedeOn])).rows[0].b);
  const tecnicoGate = await callBool(sedeOn, M_HG, T);
  ck("DEFINER: tecnico NON accede alla sede via RLS ma il gate risponde true", tecnicoVedeSede === false && tecnicoGate === true, `can_access_sede=${tecnicoVedeSede} gate=${tecnicoGate}`);

  // --- 3. Template HACCP: deep-equal contro il file canonico ---
  console.log("\n[3] Template HACCP — fedeltà byte-per-byte contro il file canonico");
  const canon = JSON.parse(readFileSync(join(ROOT, "seed", "template-haccp-generico-v1.0.json"), "utf8"));
  const dbRow = (await c.query(`SELECT id,nome,versione,attivo,struttura_json FROM public.template_master WHERE modulo_id=$1`, [M_HG])).rows;
  ck("una sola riga template HACCP, versione 1, attivo", dbRow.length === 1 && dbRow[0].versione === 1 && dbRow[0].attivo === true, `righe=${dbRow.length} v=${dbRow[0]?.versione} attivo=${dbRow[0]?.attivo}`);
  const dbJson = dbRow[0].struttura_json;
  const diff = deepEqual(canon, dbJson);
  ck("struttura_json === JSON canonico (deep-equal completo)", diff === null, diff || "identico");
  const counts = (dbJson.sezioni || []).map((s) => s.domande.length);
  ck("8 sezioni / 46 domande / conteggi [7,4,7,6,9,5,4,4]", dbJson.sezioni.length === 8 && counts.join(",") === "7,4,7,6,9,5,4,4" && counts.reduce((a, b) => a + b, 0) === 46, counts.join(","));
  ck("tipo_scoring=haccp_media_sezione, etichette PC=Migliorabile", dbJson.tipo_scoring === "haccp_media_sezione" && dbJson.etichette.PC === "Migliorabile", `${dbJson.tipo_scoring}`);

  // --- 4. retail/collettiva non attivabili ---
  console.log("\n[4] retail/collettiva spenti a catalogo");
  const cat = (await c.query(`SELECT codice,attivo FROM public.moduli WHERE codice IN ('haccp_retail','haccp_collettiva','haccp_generico','sicurezza') ORDER BY codice`)).rows;
  const cm = Object.fromEntries(cat.map((r) => [r.codice, r.attivo]));
  ck("catalogo: HG=true, sicurezza=true, retail=false, collettiva=false", cm.haccp_generico === true && cm.sicurezza === true && cm.haccp_retail === false && cm.haccp_collettiva === false, JSON.stringify(cm));
  const tmplPerModulo = (await c.query(`SELECT modulo_id, count(*)::int n FROM public.template_master WHERE attivo=true GROUP BY modulo_id`)).rows;
  const retailTmpl = tmplPerModulo.find((r) => r.modulo_id === M_RET);
  ck("nessun template attivo per retail (non selezionabile)", !retailTmpl, retailTmpl ? `n=${retailTmpl.n}` : "0");

  // --- 5. Numerazione ---
  console.log("\n[5] Numerazione per prefisso");
  const anno = new Date().getFullYear();
  const maxSc = (await c.query(`SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_verbale,'-',3) AS int)),0) m FROM public.visite WHERE numero_verbale LIKE $1`, [`SC-${anno}-%`])).rows[0].m;
  const mkVis = async (mod) => (await svc(() => c.query(`INSERT INTO public.visite (cliente_id,sede_id,specialist_id,modulo_id,data_visita,stato,template_snapshot) VALUES ($1,$2,$3,$4,CURRENT_DATE,'bozza','{}'::jsonb) RETURNING id`, [cli, sedeOn, A, mod]))).rows[0].id;
  const vSic = await mkVis(M_SIC);
  const nSic = (await svc(() => c.query(`SELECT public.assegna_numero_verbale($1) n`, [vSic]))).rows[0].n;
  const attesoSc = `SC-${anno}-${String(maxSc + 1).padStart(4, "0")}`;
  ck(`SC prosegue: ${nSic} === ${attesoSc}`, nSic === attesoSc);
  const vHg = await mkVis(M_HG);
  const nHg = (await svc(() => c.query(`SELECT public.assegna_numero_verbale($1) n`, [vHg]))).rows[0].n;
  ck(`primo HACCP -> HACCP-${anno}-0001`, nHg === `HACCP-${anno}-0001`, nHg);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
