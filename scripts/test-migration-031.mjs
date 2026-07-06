/**
 * Test migration 031 (organizzazione singleton) — BEGIN…ROLLBACK, nessuna
 * persistenza. Esegue la 031 dentro la transazione, poi valida:
 *  - SEED: esiste 1 riga ('Studio Bilello')
 *  - SINGLETON: seconda INSERT (singleton=true) → viola UNIQUE; INSERT singleton=false → viola CHECK
 *  - TRIGGER: update_aggiornato_il sovrascrive aggiornato_il
 *  - RLS (SET ROLE authenticated, MAI superuser):
 *      · SELECT: admin/planner/tecnico attivi → 1 riga (lettura per tutti)
 *      · UPDATE: admin → OK; planner/tecnico → 0 righe
 *      · INSERT/DELETE: admin → negati (nessuna policy)
 *
 * Uso: node scripts/test-migration-031.mjs
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
const SQL = readFileSync(join(ROOT, "supabase/migrations/031_organizzazione_singleton.sql"), "utf8");

let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }
const claims = (uid) => JSON.stringify({ sub: uid, role: "authenticated" });

async function main() {
  const c = new pg.Client({
    host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432,
    user: `postgres.${REF}`, password: PW, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
  });
  const asUser = async (uid, fn) => {
    await c.query(`SET LOCAL request.jwt.claims = '${claims(uid)}'`);
    await c.query(`SET LOCAL ROLE authenticated`);
    try { return await fn(); } finally { await c.query(`RESET ROLE`); }
  };
  const attesoBlocco = async (sql, params, uid = null) => {
    await c.query("SAVEPOINT sp");
    if (uid) { await c.query(`SET LOCAL request.jwt.claims = '${claims(uid)}'`); await c.query(`SET LOCAL ROLE authenticated`); }
    let bloccato = false;
    try { await c.query(sql, params); } catch { bloccato = true; }
    await c.query("ROLLBACK TO SAVEPOINT sp");
    return bloccato;
  };

  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

    // Applica la migration nella transazione.
    await c.query(SQL);
    ck("031 applicata senza errori (DDL + seed)", true);

    // SEED
    const seed = (await c.query(`SELECT ragione_sociale, singleton FROM public.organizzazione`)).rows;
    ck("SEED: 1 riga singleton 'Studio Bilello'", seed.length === 1 && seed[0].ragione_sociale === "Studio Bilello" && seed[0].singleton === true, JSON.stringify(seed));

    // SINGLETON — seconda riga (default singleton=true) → UNIQUE violation
    const uniq = await attesoBlocco(`INSERT INTO public.organizzazione (ragione_sociale) VALUES ('Altra Org')`);
    ck("SINGLETON: seconda INSERT (singleton=true) → bloccata (UNIQUE)", uniq);
    // singleton=false → CHECK violation
    const chk = await attesoBlocco(`INSERT INTO public.organizzazione (ragione_sociale, singleton) VALUES ('X', false)`);
    ck("SINGLETON: INSERT con singleton=false → bloccata (CHECK)", chk);

    // TRIGGER — tenta di forzare aggiornato_il al 2000; il trigger deve sovrascrivere con now()
    await c.query(`UPDATE public.organizzazione SET ragione_sociale='Studio Bilello 2', aggiornato_il='2000-01-01'`);
    const anno = (await c.query(`SELECT EXTRACT(YEAR FROM aggiornato_il)::int AS y FROM public.organizzazione`)).rows[0].y;
    ck("TRIGGER: update_aggiornato_il sovrascrive aggiornato_il (anno ≠ 2000)", anno >= 2026, `anno=${anno}`);

    // RLS — ids reali
    const admin = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
    const planner = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;
    const tecnico = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;

    for (const [nome, uid] of [["admin", admin], ["planner", planner], ["tecnico", tecnico]]) {
      const n = await asUser(uid, async () => (await c.query(`SELECT count(*)::int n FROM public.organizzazione`)).rows[0].n);
      ck(`RLS SELECT: ${nome} legge il profilo org (1 riga)`, n === 1, `n=${n}`);
    }

    const uAdmin = await asUser(admin, () => c.query(`UPDATE public.organizzazione SET ragione_sociale='Studio Bilello' WHERE singleton`));
    ck("RLS UPDATE: admin → consentito", uAdmin.rowCount === 1, `rows=${uAdmin.rowCount}`);
    const uPlanner = await asUser(planner, () => c.query(`UPDATE public.organizzazione SET ragione_sociale='Hack' WHERE singleton`));
    ck("RLS UPDATE: planner → 0 righe", uPlanner.rowCount === 0, `rows=${uPlanner.rowCount}`);
    const uTecnico = await asUser(tecnico, () => c.query(`UPDATE public.organizzazione SET ragione_sociale='Hack' WHERE singleton`));
    ck("RLS UPDATE: tecnico → 0 righe", uTecnico.rowCount === 0, `rows=${uTecnico.rowCount}`);

    // INSERT/DELETE come admin → negati (nessuna policy)
    const insAdmin = await attesoBlocco(`INSERT INTO public.organizzazione (ragione_sociale, singleton) VALUES ('Y', true)`, undefined, admin);
    ck("RLS INSERT: admin → negato (nessuna policy INSERT)", insAdmin);
    const delAdmin = await asUser(admin, () => c.query(`DELETE FROM public.organizzazione WHERE singleton`));
    ck("RLS DELETE: admin → 0 righe (nessuna policy DELETE)", delAdmin.rowCount === 0, `rows=${delAdmin.rowCount}`);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

await main();
