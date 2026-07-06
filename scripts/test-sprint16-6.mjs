/**
 * Test Sprint 16.6 — ciclo di vita dati (profilo self-service, anagrafica utente,
 * disattivazione/riattivazione clienti/sedi). SOLO RLS, protocollo obbligatorio:
 * pg + BEGIN…ROLLBACK + SET ROLE authenticated (+ request.jwt.claims), MAI superuser
 * come validazione. Nessuna riga persiste.
 *
 * PARTE A — utenti (profilo/anagrafica):
 *   - un utente modifica i PROPRI dati anagrafici (nome/telefono/qualifica) → OK (RLS own)
 *   - un NON-admin che tenta di cambiare il PROPRIO ruolo → BLOCCATO (trigger anti-escalation 025)
 *   - un utente che tenta di modificare un ALTRO → 0 righe (RLS own_or_admin)
 *   - un admin che modifica l'anagrafica altrui → OK (is_admin nella policy)
 * PARTE B — clienti/sedi (disattiva/riattiva = UPDATE attivo/attiva):
 *   - admin/planner → OK (RLS is_admin_or_planner)
 *   - tecnico → 0 righe (negato dalla RLS, nessuna nuova policy necessaria)
 *
 * Uso: node scripts/test-sprint16-6.mjs
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
  // Esegue fn come utente `uid` (RLS attiva); ripristina il ruolo in finally.
  const asUser = async (uid, fn) => {
    await c.query(`SET LOCAL request.jwt.claims = '${claims(uid)}'`);
    await c.query(`SET LOCAL ROLE authenticated`);
    try { return await fn(); } finally { await c.query(`RESET ROLE`); }
  };
  // Esegue una UPDATE che deve FALLIRE (trigger): savepoint + rollback-to per non
  // abortire la transazione esterna. Ritorna true se ha sollevato eccezione.
  const attesoBlocco = async (uid, sql, params) => {
    await c.query("SAVEPOINT sp");
    await c.query(`SET LOCAL request.jwt.claims = '${claims(uid)}'`);
    await c.query(`SET LOCAL ROLE authenticated`);
    let bloccato = false;
    try { await c.query(sql, params); } catch { bloccato = true; }
    await c.query("ROLLBACK TO SAVEPOINT sp"); // ripristina anche il ruolo (SET LOCAL post-savepoint)
    return bloccato;
  };

  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);

    const admin = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
    const planner = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;
    const tecnico = (await c.query(`SELECT id FROM public.utenti WHERE email='tecnico.test@safecheck.local'`)).rows[0].id;
    const cli = (await c.query(`SELECT id FROM public.clienti LIMIT 1`)).rows[0].id;
    const sede = (await c.query(`SELECT id FROM public.sedi LIMIT 1`)).rows[0].id;

    console.log("PARTE A — profilo / anagrafica utente (RLS + trigger)\n");

    // 1. self-edit anagrafica → OK
    const r1 = await asUser(tecnico, () => c.query(
      `UPDATE public.utenti SET nome_completo='Tecnico Test', telefono='+39 000', qualifica='RSPP' WHERE id=$1`, [tecnico]
    ));
    ck("A1 self-edit nome/telefono/qualifica del proprio profilo → consentito", r1.rowCount === 1, `rows=${r1.rowCount}`);

    // 2. self-change ruolo → BLOCCATO dal trigger anti-escalation
    const b2 = await attesoBlocco(tecnico, `UPDATE public.utenti SET ruolo='admin' WHERE id=$1`, [tecnico]);
    ck("A2 self-change del proprio ruolo → bloccato (anti-escalation 025)", b2);

    // 2b. self-change attivo → BLOCCATO
    const b2b = await attesoBlocco(tecnico, `UPDATE public.utenti SET attivo=false WHERE id=$1`, [tecnico]);
    ck("A2b self-change del proprio stato attivo → bloccato (anti-escalation 025)", b2b);

    // 3. edit di un ALTRO utente → 0 righe (RLS)
    const r3 = await asUser(tecnico, () => c.query(
      `UPDATE public.utenti SET nome_completo='Hack' WHERE id=$1`, [admin]
    ));
    ck("A3 tecnico modifica l'anagrafica di un ALTRO → 0 righe (RLS own_or_admin)", r3.rowCount === 0, `rows=${r3.rowCount}`);

    // 4. admin edita anagrafica altrui → OK (is_admin nella policy)
    const r4 = await asUser(admin, () => c.query(
      `UPDATE public.utenti SET nome_completo='Tecnico Test', telefono='+39 111', qualifica='ASPP' WHERE id=$1`, [tecnico]
    ));
    ck("A4 admin modifica l'anagrafica di un altro utente → consentito", r4.rowCount === 1, `rows=${r4.rowCount}`);

    console.log("\nPARTE B — disattivazione/riattivazione clienti/sedi (RLS)\n");

    // 5. planner disattiva cliente → OK
    const r5 = await asUser(planner, () => c.query(`UPDATE public.clienti SET attivo=false WHERE id=$1`, [cli]));
    ck("B5 planner disattiva un cliente → consentito", r5.rowCount === 1, `rows=${r5.rowCount}`);

    // 6. tecnico disattiva cliente → 0 righe
    const r6 = await asUser(tecnico, () => c.query(`UPDATE public.clienti SET attivo=false WHERE id=$1`, [cli]));
    ck("B6 tecnico disattiva un cliente → 0 righe (RLS is_admin_or_planner)", r6.rowCount === 0, `rows=${r6.rowCount}`);

    // 7. planner disattiva sede → OK
    const r7 = await asUser(planner, () => c.query(`UPDATE public.sedi SET attiva=false WHERE id=$1`, [sede]));
    ck("B7 planner disattiva una sede → consentito", r7.rowCount === 1, `rows=${r7.rowCount}`);

    // 8. tecnico disattiva sede → 0 righe
    const r8 = await asUser(tecnico, () => c.query(`UPDATE public.sedi SET attiva=false WHERE id=$1`, [sede]));
    ck("B8 tecnico disattiva una sede → 0 righe (RLS is_admin_or_planner)", r8.rowCount === 0, `rows=${r8.rowCount}`);

    // 9. planner riattiva cliente → OK (stessa policy UPDATE)
    const r9 = await asUser(planner, () => c.query(`UPDATE public.clienti SET attivo=true WHERE id=$1`, [cli]));
    ck("B9 planner riattiva un cliente → consentito", r9.rowCount === 1, `rows=${r9.rowCount}`);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

await main();
