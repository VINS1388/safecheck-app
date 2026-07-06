/**
 * Test Sprint 16.6 STEP 6 — hard-delete controllato. pg + BEGIN…ROLLBACK.
 *
 * PARTE A (logica dipendenze + delete pulito, fixtures come owner):
 *   - cliente pulito → eliminabile, DELETE riesce
 *   - cliente con 1 sede → NON eliminabile (le sedi contano, evita cascata)
 *   - sede pulita (solo moduli_sede) → eliminabile; pulizia esplicita moduli_sede + DELETE sede
 *   - sede con piano → NON eliminabile
 * PARTE B (utente):
 *   - dipendenze: tecnico.test (ha slot reali) → NON eliminabile
 *   - anti-lockout: DELETE dell'ULTIMO admin attivo → bloccato (trigger 027, SC001)
 * PARTE C (RLS DELETE = admin-only, SET ROLE authenticated):
 *   - clienti/sedi: tecnico → 0, planner → 0, admin → 1 (H.2: delete is_admin, NON planner)
 *
 * Uso: node scripts/test-sprint16-6-harddelete.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
function env(name) {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === name) return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`env mancante: ${name}`);
}
const PW = decodeURIComponent(new URL(env("DATABASE_URL")).password);

let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }
const claims = (uid) => JSON.stringify({ sub: uid, role: "authenticated" });

async function main() {
  const c = new pg.Client({
    host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432,
    user: `postgres.${REF}`, password: PW, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
  });
  const n1 = async (sql, p) => (await c.query(sql, p)).rows[0].n;
  const conta = (tab, col, val) => n1(`SELECT count(*)::int n FROM public.${tab} WHERE ${col}=$1`, [val]);
  const asUser = async (uid, fn) => {
    await c.query(`SET LOCAL request.jwt.claims = '${claims(uid)}'`);
    await c.query(`SET LOCAL ROLE authenticated`);
    try { return await fn(); } finally { await c.query(`RESET ROLE`); }
  };
  const attesoBlocco = async (fn) => {
    await c.query("SAVEPOINT sp");
    let bloccato = false;
    try { await fn(); } catch { bloccato = true; }
    await c.query("ROLLBACK TO SAVEPOINT sp");
    return bloccato;
  };

  await c.connect();
  try {
    await c.query("BEGIN");
    const modulo = (await c.query(`SELECT id FROM public.moduli WHERE codice='sicurezza' LIMIT 1`)).rows[0].id;

    console.log("PARTE A — dipendenze clienti/sedi + delete pulito\n");

    // Cliente pulito
    const cliA = (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('HD Pulito') RETURNING id`)).rows[0].id;
    const depA = (await conta("sedi", "cliente_id", cliA)) + (await conta("visite", "cliente_id", cliA)) +
      (await conta("template_cliente", "cliente_id", cliA)) + (await conta("template_sede", "cliente_id", cliA)) +
      (await conta("scadenze", "cliente_id", cliA));
    ck("A1 cliente pulito → dipendenze=0 (eliminabile)", depA === 0, `dep=${depA}`);
    const delA = await c.query(`DELETE FROM public.clienti WHERE id=$1`, [cliA]);
    ck("A2 cliente pulito → DELETE riesce", delA.rowCount === 1, `rows=${delA.rowCount}`);

    // Cliente con sede → non eliminabile
    const cliB = (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('HD ConSede') RETURNING id`)).rows[0].id;
    const sedeB = (await c.query(`INSERT INTO public.sedi (cliente_id, nome, indirizzo, citta) VALUES ($1,'S','V','C') RETURNING id`, [cliB])).rows[0].id;
    await c.query(`INSERT INTO public.moduli_sede (sede_id, modulo_id, attivo) VALUES ($1,$2,true)`, [sedeB, modulo]);
    ck("A3 cliente con 1 sede → NON eliminabile (sedi contano)", (await conta("sedi", "cliente_id", cliB)) === 1);

    // Sede pulita (solo moduli_sede) → eliminabile; pulizia esplicita + delete
    const depSedeB = (await conta("visite", "sede_id", sedeB)) + (await conta("piani_visite", "sede_id", sedeB)) +
      (await conta("visite_pianificate", "sede_id", sedeB)) + (await conta("template_sede", "sede_id", sedeB)) +
      (await conta("scadenze", "sede_id", sedeB));
    ck("A4 sede pulita → dipendenze=0 (moduli_sede NON conta)", depSedeB === 0, `dep=${depSedeB}`);
    ck("A4b moduli_sede presente prima del delete", (await conta("moduli_sede", "sede_id", sedeB)) === 1);
    // Singolo DELETE FROM sedi: il CASCADE esistente moduli_sede→sedi (028) rimuove il figlio, atomico.
    const delSede = await c.query(`DELETE FROM public.sedi WHERE id=$1`, [sedeB]);
    ck("A5 sede pulita → singolo DELETE sedi; moduli_sede rimosso via CASCADE", delSede.rowCount === 1 && (await conta("moduli_sede", "sede_id", sedeB)) === 0);

    // Sede con piano → non eliminabile
    const sedeC = (await c.query(`INSERT INTO public.sedi (cliente_id, nome, indirizzo, citta) VALUES ($1,'S2','V','C') RETURNING id`, [cliB])).rows[0].id;
    await c.query(`INSERT INTO public.piani_visite (sede_id, data_inizio_ciclo, visite_anno, modulo_id) VALUES ($1,'2026-01-01',4,$2)`, [sedeC, modulo]);
    ck("A6 sede con piano → NON eliminabile", (await conta("piani_visite", "sede_id", sedeC)) === 1);

    console.log("\nPARTE B — utente: dipendenze + anti-lockout su DELETE\n");

    const tecnico = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
    const depSlotTec = await conta("visite_pianificate", "tecnico_assegnato_id", tecnico);
    ck("B1 tecnico.test ha slot collegati → NON eliminabile", depSlotTec > 0, `slot=${depSlotTec}`);

    // Riduci a 1 admin attivo, poi DELETE dell'ultimo → bloccato (027)
    const admins = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true ORDER BY id`)).rows.map((r) => r.id);
    for (let i = 0; i < admins.length - 1; i++) {
      await c.query(`UPDATE public.utenti SET attivo=false WHERE id=$1`, [admins[i]]); // lascia ≥1 → consentito
    }
    const ultimo = admins[admins.length - 1];
    const bloccato = await attesoBlocco(() => c.query(`DELETE FROM public.utenti WHERE id=$1`, [ultimo]));
    ck("B2 DELETE dell'ULTIMO admin attivo → bloccato (anti-lockout 027)", bloccato, `admins_iniziali=${admins.length}`);

    console.log("\nPARTE C — RLS DELETE clienti/sedi = admin-only (H.2)\n");

    const admin = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
    const planner = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;

    const cliRLS = (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('HD RLS') RETURNING id`)).rows[0].id;
    const dTec = await asUser(tecnico, () => c.query(`DELETE FROM public.clienti WHERE id=$1`, [cliRLS]));
    ck("C1 tecnico DELETE cliente → 0 righe", dTec.rowCount === 0, `rows=${dTec.rowCount}`);
    const dPlan = await asUser(planner, () => c.query(`DELETE FROM public.clienti WHERE id=$1`, [cliRLS]));
    ck("C2 planner DELETE cliente → 0 righe (delete is_admin, NON planner)", dPlan.rowCount === 0, `rows=${dPlan.rowCount}`);
    const dAdmin = await asUser(admin, () => c.query(`DELETE FROM public.clienti WHERE id=$1`, [cliRLS]));
    ck("C3 admin DELETE cliente → 1 riga", dAdmin.rowCount === 1, `rows=${dAdmin.rowCount}`);

    // Sede: stessa gerarchia
    const cliS = (await c.query(`INSERT INTO public.clienti (ragione_sociale) VALUES ('HD RLS Sede') RETURNING id`)).rows[0].id;
    const sedeRLS = (await c.query(`INSERT INTO public.sedi (cliente_id, nome, indirizzo, citta) VALUES ($1,'S','V','C') RETURNING id`, [cliS])).rows[0].id;
    const sTec = await asUser(tecnico, () => c.query(`DELETE FROM public.sedi WHERE id=$1`, [sedeRLS]));
    const sPlan = await asUser(planner, () => c.query(`DELETE FROM public.sedi WHERE id=$1`, [sedeRLS]));
    ck("C4 tecnico/planner DELETE sede → 0 righe", sTec.rowCount === 0 && sPlan.rowCount === 0);
    const sAdmin = await asUser(admin, () => c.query(`DELETE FROM public.sedi WHERE id=$1`, [sedeRLS]));
    ck("C5 admin DELETE sede → 1 riga", sAdmin.rowCount === 1, `rows=${sAdmin.rowCount}`);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

await main();
