/**
 * Test Sprint 16 · Checkpoint 2 — Edge case D: tecnico disattivato con slot.
 *
 * Copre le due parti della feature:
 *   a. Badge "Tecnico disattivato" in pianificazione — risoluzione del NOME di un
 *      tecnico disattivato assegnato a uno slot storico (mappa separata, mai un
 *      roster assegnabile).
 *   b. Conteggio slot futuri (stato <> 'eseguita') assegnati a un tecnico, mostrato
 *      come avviso non bloccante prima della disattivazione.
 *
 * PARTE 1 (RLS, pg, BEGIN…ROLLBACK, SET ROLE authenticated — MAI superuser come
 *   validazione): un NON-admin (planner) vede via RLS solo la propria riga di
 *   `utenti` → NON può risolvere il nome di un altro utente (tantomeno disattivato).
 *   È la ragione per cui la risoluzione dei nomi disattivati (getTecniciDisattivatiNomi)
 *   e il conteggio slot (contaSlotFuturiTecnico) girano via SERVICE ROLE dopo il gate
 *   applicativo, non via client RLS. L'admin invece vede tutte le righe.
 *
 * PARTE 2 (logica dati, fixture in BEGIN…ROLLBACK): il PREDICATO del conteggio e la
 *   classificazione roster attivo/disattivato. Qui le query girano come owner (come
 *   il service role in app, che bypassa la RLS): si valida la CORRETTEZZA della query,
 *   non un confine RLS. Nessuna riga persiste (ROLLBACK garantito).
 *
 * Uso: node scripts/test-sprint16-edge-case-d.mjs
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

const client = () => new pg.Client({
  host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432,
  user: `postgres.${REF}`, password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});

// ── PARTE 1 — RLS: perché serve il service role per risolvere/contare ─────────
async function parteRLS() {
  const c = client();
  const asUser = async (uid, fn) => {
    await c.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`);
    await c.query(`SET LOCAL ROLE authenticated`);
    try { return await fn(); } finally { await c.query(`RESET ROLE`); }
  };
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('request.jwt.claims',NULL,true)`);
    const tot = (await c.query(`SELECT count(*)::int n FROM public.utenti`)).rows[0].n;
    const admin = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;
    const planner = (await c.query(`SELECT id FROM public.utenti WHERE email='planner.test@safecheck.local'`)).rows[0].id;

    const nAdmin = await asUser(admin, async () => (await c.query(`SELECT count(*)::int n FROM public.utenti`)).rows[0].n);
    ck("RLS: admin risolve TUTTI i nomi utente (roster + disattivati)", nAdmin === tot, `admin=${nAdmin} tot=${tot}`);

    const visPl = await asUser(planner, async () => (await c.query(`SELECT id FROM public.utenti`)).rows.map(r => r.id));
    ck("RLS: un NON-admin (planner) vede SOLO la propria riga → non può risolvere altri nomi",
      visPl.length === 1 && visPl[0] === planner, `viste=${visPl.length}`);
  } finally { await c.query("ROLLBACK").catch(() => {}); await c.end(); }
}

// ── PARTE 2 — conteggio slot + classificazione roster attivo/disattivato ──────
async function parteDati() {
  const c = client();
  await c.connect();
  try {
    await c.query("BEGIN");

    // Disattivato "tecnico D": riusa un account di test, flip attivo=false nella tx.
    const D = (await c.query(
      `UPDATE public.utenti SET attivo=false WHERE email='tecnico.test@safecheck.local' RETURNING id, nome_completo`
    )).rows[0];
    ck("setup: tecnico.test flippato a disattivato", !!D?.id, D?.nome_completo || "");
    const admin = (await c.query(`SELECT id FROM public.utenti WHERE ruolo='admin' AND attivo=true LIMIT 1`)).rows[0].id;

    // Fixture minimo cliente → sede → piano.
    const cli = (await c.query(
      `INSERT INTO public.clienti (ragione_sociale) VALUES ('EDGE-D Test Srl') RETURNING id`
    )).rows[0].id;
    const sede = (await c.query(
      `INSERT INTO public.sedi (cliente_id, nome, indirizzo, citta)
       VALUES ($1,'Sede Test','Via Test 1','Testcittà') RETURNING id`, [cli]
    )).rows[0].id;
    const modulo = (await c.query(
      `SELECT id FROM public.moduli WHERE codice='sicurezza' LIMIT 1`
    )).rows[0].id;
    const piano = (await c.query(
      `INSERT INTO public.piani_visite (sede_id, data_inizio_ciclo, visite_anno, modulo_id)
       VALUES ($1,'2026-01-01',4,$2) RETURNING id`, [sede, modulo]
    )).rows[0].id;

    // Slot: 2 pianificata + 1 da_pianificare assegnati a D (futuri) = 3 impattati;
    // 1 eseguita assegnata a D (NON impattato); 1 pianificata assegnata all'admin
    // ATTIVO (scoping); 1 senza tecnico (da assegnare).
    // Baseline: D potrebbe già avere slot reali in prod (test Sprint 15.2). Il
    // conteggio app NON è scopato per piano (conta tutti gli slot del tecnico):
    // si valida il PREDICATO ('esclude eseguita') sul DELTA rispetto al baseline.
    const contaD = async () => (await c.query(
      `SELECT count(*)::int n FROM public.visite_pianificate
       WHERE tecnico_assegnato_id = $1 AND stato <> 'eseguita'`, [D.id]
    )).rows[0].n;
    const baseline = await contaD();

    const ins = async (num, stato, tecnico) => c.query(
      `INSERT INTO public.visite_pianificate
        (piano_id, sede_id, numero_visita, data_suggerita, stato, tecnico_assegnato_id)
       VALUES ($1,$2,$3,'2026-03-01',$4,$5)`,
      [piano, sede, num, stato, tecnico]
    );
    await ins(1, "pianificata", D.id);
    await ins(2, "pianificata", D.id);
    await ins(3, "da_pianificare", D.id);
    await ins(4, "eseguita", D.id);       // esclusa dal conteggio
    await ins(5, "pianificata", admin);   // altro tecnico, esclusa dallo scope di D
    await ins(6, "da_pianificare", null); // da assegnare

    // (b) PREDICATO del conteggio: dei 4 slot aggiunti a D (3 futuri + 1 eseguita),
    // e 2 non suoi (admin/NULL), solo i 3 futuri di D incrementano il conteggio.
    const cnt = await contaD();
    ck("conteggio: +3 slot futuri di D (esclude 'eseguita' e slot di altri tecnici)",
      cnt - baseline === 3, `baseline=${baseline} dopo=${cnt}`);

    // (a) classificazione roster — mirror delle query app:
    const inRosterAttivo = (await c.query(
      `SELECT 1 FROM public.utenti WHERE id=$1 AND attivo=true AND ruolo IN ('admin','specialist')`, [D.id]
    )).rowCount;
    ck("roster attivo (getTecniciOpzioni): D disattivato NON è assegnabile", inRosterAttivo === 0);

    const disatt = (await c.query(
      `SELECT nome_completo FROM public.utenti WHERE id=$1 AND attivo=false`, [D.id]
    )).rows[0];
    ck("risoluzione nomi disattivati (getTecniciDisattivatiNomi): D presente col nome",
      !!disatt && disatt.nome_completo === D.nome_completo, disatt?.nome_completo || "assente");

    // (a) logica di badge (mirror del mapping in page.tsx) su un id assegnato a D.
    const attivoMap = new Map(
      (await c.query(`SELECT id, nome_completo FROM public.utenti WHERE attivo=true AND ruolo IN ('admin','specialist')`))
        .rows.map(r => [r.id, r.nome_completo])
    );
    const disattMap = new Map(
      (await c.query(`SELECT id, nome_completo FROM public.utenti WHERE attivo=false`))
        .rows.map(r => [r.id, r.nome_completo])
    );
    const risolvi = (tecnicoId) => {
      const nomeAttivo = tecnicoId ? attivoMap.get(tecnicoId) ?? null : null;
      const nomeDisatt = tecnicoId && !nomeAttivo ? disattMap.get(tecnicoId) ?? null : null;
      return { tecnicoNome: nomeAttivo ?? nomeDisatt, tecnicoDisattivato: nomeDisatt != null };
    };
    const rD = risolvi(D.id);
    ck("badge: slot di D → tecnicoDisattivato=true col nome risolto",
      rD.tecnicoDisattivato === true && rD.tecnicoNome === D.nome_completo, JSON.stringify(rD));
    const rA = risolvi(admin);
    ck("badge: slot di tecnico ATTIVO → tecnicoDisattivato=false, nome risolto",
      rA.tecnicoDisattivato === false && !!rA.tecnicoNome, JSON.stringify(rA));
    const rNull = risolvi(null);
    ck("badge: slot senza tecnico → nessun nome, nessun badge disattivato",
      rNull.tecnicoDisattivato === false && rNull.tecnicoNome === null, JSON.stringify(rNull));
  } finally {
    await c.query("ROLLBACK").catch(() => {}); // niente persiste: fixtures + flip annullati
    await c.end();
  }
}

console.log("PARTE 1 — RLS: non-admin non risolve nomi altrui (serve service role)\n");
await parteRLS();
console.log("\nPARTE 2 — conteggio slot futuri + logica badge disattivato\n");
await parteDati();
console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
