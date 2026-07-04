/**
 * Sprint 16 — SCAFFOLD test RLS-enforced (protocollo obbligatorio).
 *
 * Regola permanente: ogni test che tocca la RLS gira con RLS ENFORCED —
 * SET ROLE authenticated + request.jwt.claims coerenti + RESET ROLE. MAI da
 * superuser/pooler owner (bypassa la RLS: il bug della policy DELETE mancante
 * è sfuggito proprio così). Pattern di riferimento: test-hotfix-elimina-bozza.mjs.
 *
 * Stato: questo file valida l'HARNESS contro la RLS ATTUALE (baseline pre-025) e
 * documenta gli scenari che verranno attivati dopo la migration 025 (policy
 * per-ruolo). Gli scenari 'planner' richiedono la migration 024 già applicata
 * (l'enum deve contenere 'planner'): se assente, vengono saltati.
 *
 * Uso: node scripts/test-sprint16-rls.mjs
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

let pass = 0, fail = 0, skip = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? "  — " + extra : ""}`);
  if (ok) pass++; else fail++;
}

/** Esegue fn "come utente autenticato uid" (RLS enforced), poi ripristina superuser. */
async function asUser(uid, fn) {
  await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`);
  await c.query(`SET LOCAL ROLE authenticated`);
  try {
    return await fn();
  } finally {
    await c.query(`RESET ROLE`);
  }
}
async function countAs(uid, sql, params = []) {
  return asUser(uid, async () => (await c.query(sql, params)).rowCount);
}

await c.connect();
try {
  await c.query("BEGIN");

  // Enum planner presente? (migration 024). Gli scenari planner dipendono da questo.
  const enumVals = (await c.query(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='ruolo_utente'`
  )).rows.map((r) => r.enumlabel);
  const hasPlanner = enumVals.includes("planner");
  console.log(`Enum ruolo_utente: ${enumVals.join(", ")}${hasPlanner ? "" : "  (024 non ancora applicata → scenari planner saltati)"}\n`);

  // ── Utenti reali (utenti.id ha FK verso auth.users → non si possono creare
  //    utenti fittizi in transazione). Uso read-only (rolled back): sicuro.
  //    Il ruolo planner non ha ancora un account reale → scenari planner rinviati
  //    al checkpoint 025 (creando un account planner via crea-utente.mjs). ──
  const uAdmin = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0]?.id;
  const uTecnico = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='specialist' AND attivo=true LIMIT 1`)).rows[0]?.id;
  if (!uAdmin || !uTecnico) {
    console.log("⚠️  Servono almeno un admin e uno specialist reali per il baseline.");
    await c.query("ROLLBACK");
    process.exit(1);
  }

  // ── BASELINE (RLS attuale, pre-025) — valida l'harness ──
  const totClienti = (await c.query(`SELECT count(*)::int n FROM public.clienti WHERE attivo=true`)).rows[0].n;
  const adminClienti = await asUser(uAdmin, async () =>
    (await c.query(`SELECT count(*)::int n FROM public.clienti WHERE attivo=true`)).rows[0].n
  );
  check("BASELINE: admin vede i clienti (policy auth attuale)", adminClienti === totClienti, `${adminClienti}/${totClienti}`);

  const tecnicoClienti = await asUser(uTecnico, async () =>
    (await c.query(`SELECT count(*)::int n FROM public.clienti WHERE attivo=true`)).rows[0].n
  );
  // ⚠️ Pre-025 il tecnico vede TUTTI i clienti (gap noto). Post-025 questa assert va INVERTITA.
  check("BASELINE (gap noto pre-025): il tecnico vede TUTTI i clienti", tecnicoClienti === totClienti,
    `tecnico=${tecnicoClienti} tot=${totClienti} — DOPO 025 deve diventare < tot`);

  // visite: la RLS own_or_admin è già attiva → il tecnico vede solo le proprie (0 di test qui)
  const tecnicoVisite = await countAs(uTecnico, `SELECT id FROM public.visite WHERE specialist_id <> $1`, [uTecnico]);
  check("BASELINE: il tecnico NON vede visite altrui (own_or_admin già attiva)", tecnicoVisite === 0, `altrui visibili=${tecnicoVisite}`);

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARI DA ATTIVARE DOPO LA MIGRATION 025 (checkpoint) — elenco previsto:
  //   clienti/sedi/piani_visite/visite_pianificate/scadenze SELECT:
  //     · admin/planner → vedono tutto
  //     · tecnico → vede SOLO il raggiungibile (visite proprie ∪ slot assegnati)
  //   visite_pianificate INSERT/UPDATE:
  //     · admin/planner → ok ; tecnico → negato (0 righe / errore)
  //   visite UPDATE/DELETE: restano own_or_admin (planner NON incluso — Q2/Q3)
  //   verbali_pdf/risposte/imprese/punteggi: seguono le visite (+planner in lettura)
  //   buchi chiusi: sedi DELETE, risposte DELETE, verbali_pdf U/D
  //   utente attivo=false: nessun accesso (helper RLS con attivo=true)
  // Ogni scenario: asUser(admin|planner|tecnico) + assert su righe viste/mutate.
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n(Scenari 025 non ancora eseguibili: policy da scrivere al checkpoint. Harness pronto.)");

  console.log(`\nRisultato: ${pass} pass, ${fail} fail, ${skip} skip`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK eseguito — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
