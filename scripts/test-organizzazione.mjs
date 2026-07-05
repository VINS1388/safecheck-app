/**
 * Test Fase D — area /organizzazione. Due parti:
 *
 *  PARTE 1 (RLS, pg, BEGIN…ROLLBACK, SET ROLE authenticated — mai superuser):
 *    scoping letture su `utenti` — un admin vede tutti gli utenti, un tecnico
 *    vede SOLO la propria riga (difesa in profondità sotto il guard applicativo
 *    del modulo dati, che gira comunque come admin).
 *
 *  PARTE 2 (smoke del MECCANISMO create/ruolo/reset via Admin API + login reale):
 *    su un utente USA-E-GETTA (email dedicata), con cleanup garantito:
 *    create (specialist) → login con password temporanea → cambio ruolo attraverso
 *    i 3 ruoli → reset password → login con la nuova (vecchia non più valida) →
 *    delete → verifica rimozione. Mirror del percorso di creaUtente/cambiaRuolo/
 *    resetPassword del modulo dati (le funzioni reali richiedono la sessione Next,
 *    non esercitabile qui: il guard admin è coperto da build/tipi + verifica E2E).
 *
 * NB: la Parte 2 PERSISTE transitoriamente in prod (crea/rimuove 1 auth user
 * usa-e-getta). Cleanup in finally + verifica finale di assenza.
 *
 * Uso: node scripts/test-organizzazione.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SMOKE_EMAIL = "fase-d-smoke@safecheck.local";
const SMOKE_NOME = "Utente Smoke Fase D";

function env(name) {
  for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === name) return l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`env mancante: ${name}`);
}
const URL_SB = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
const PW = decodeURIComponent(new URL(env("DATABASE_URL")).password);

let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }

// ── PARTE 1 — RLS ─────────────────────────────────────────────────────────────
async function parteRLS() {
  const c = new pg.Client({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}`, password: PW, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  const asUser = async (uid, fn) => { await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`); await c.query(`SET LOCAL ROLE authenticated`); try { return await fn(); } finally { await c.query(`RESET ROLE`); } };
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);
    const tot = (await c.query(`SELECT count(*)::int n FROM public.utenti`)).rows[0].n;
    const A = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
    const T = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;

    const nAdmin = await asUser(A, async () => (await c.query(`SELECT count(*)::int n FROM public.utenti`)).rows[0].n);
    ck("RLS: admin vede TUTTI gli utenti", nAdmin === tot, `admin=${nAdmin} tot=${tot}`);

    const visT = await asUser(T, async () => (await c.query(`SELECT id FROM public.utenti`)).rows.map(r => r.id));
    ck("RLS: tecnico vede SOLO la propria riga", visT.length === 1 && visT[0] === T, `viste=${visT.length}`);
  } finally { await c.query("ROLLBACK").catch(() => {}); await c.end(); }
}

// ── PARTE 2 — smoke Admin API ────────────────────────────────────────────────
async function parteSmoke() {
  const admin = createClient(URL_SB, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = () => createClient(URL_SB, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const login = async (email, password) => { const { data, error } = await anon().auth.signInWithPassword({ email, password }); return !error && !!data?.session; };
  const trovaByEmail = async () => { const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 }); return data?.users?.find(u => u.email === SMOKE_EMAIL) ?? null; };
  const rigaUtenti = async (id) => (await admin.from("utenti").select("id,nome_completo,ruolo,attivo").eq("id", id).maybeSingle()).data;

  // pre-cleanup difensivo
  const pre = await trovaByEmail(); if (pre) await admin.auth.admin.deleteUser(pre.id).catch(() => {});

  let uid = null;
  try {
    // create (specialist) — mirror di creaUtente: createUser+metadata → trigger → normalize
    const p1 = "Aa2!" + Math.random().toString(36).slice(2, 14) + "Zz9#"; // password temporanea usa-e-getta (test)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email: SMOKE_EMAIL, password: p1, email_confirm: true, user_metadata: { nome_completo: SMOKE_NOME, ruolo: "specialist" } });
    ck("smoke: createUser riuscito", !cErr && !!created?.user, cErr?.message || "");
    if (!created?.user) return;
    uid = created.user.id;
    await admin.from("utenti").update({ nome_completo: SMOKE_NOME, ruolo: "specialist", attivo: true }).eq("id", uid);
    const r0 = await rigaUtenti(uid);
    ck("smoke: profilo utenti creato dal trigger, ruolo specialist", r0?.ruolo === "specialist" && r0?.attivo === true && r0?.nome_completo === SMOKE_NOME);

    ck("smoke: login con password temporanea (create) riuscito", await login(SMOKE_EMAIL, p1));

    // flussi 3 ruoli
    for (const ruolo of ["planner", "admin", "specialist"]) {
      await admin.from("utenti").update({ ruolo }).eq("id", uid);
      const r = await rigaUtenti(uid);
      ck(`smoke: cambio ruolo → ${ruolo}`, r?.ruolo === ruolo);
    }

    // reset password: nuova valida, vecchia non più
    const p2 = "Bb3!" + Math.random().toString(36).slice(2, 14) + "Yy8#";
    const { error: rErr } = await admin.auth.admin.updateUserById(uid, { password: p2 });
    ck("smoke: reset password (updateUserById) riuscito", !rErr, rErr?.message || "");
    ck("smoke: login con la NUOVA password riuscito", await login(SMOKE_EMAIL, p2));
    ck("smoke: login con la VECCHIA password RIFIUTATO", !(await login(SMOKE_EMAIL, p1)));
  } finally {
    // cleanup garantito
    const u = uid ? { id: uid } : await trovaByEmail();
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
    const dopo = await trovaByEmail();
    ck("cleanup: utente usa-e-getta rimosso", !dopo);
    if (uid) { const r = await rigaUtenti(uid); ck("cleanup: riga utenti rimossa (cascade)", !r); }
  }
}

console.log("PARTE 1 — RLS scoping letture utenti\n");
await parteRLS();
console.log("\nPARTE 2 — smoke meccanismo create/ruolo/reset + login\n");
await parteSmoke();
console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
