// Test Sprint 10 — CRUD sedi + dashboard. Due parti:
//  PART 1 (sola lettura su dati reali): verifica RPC dashboard_kpi/
//    dashboard_clienti contro conteggi indipendenti + regola di blocco
//    eliminazione sede + filtro ricerca.
//  PART 2 (transazione con ROLLBACK finale → nessuna scrittura persistente):
//    round-trip CRUD sede su righe usa-e-getta (principale, soft-delete,
//    blocco eliminazione con visite, blocco eliminazione cliente con visite).
//
// Uso: node scripts/test-sprint10.mjs
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

let fail = false;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fail = true;
};
const one = async (s, p = []) => (await c.query(s, p)).rows[0];
const all = async (s, p = []) => (await c.query(s, p)).rows;

await c.connect();
try {
  // ── PART 1 — sola lettura su dati reali ──────────────────────────────────
  console.log("── PART 1 — dashboard KPI / regole (read-only) ──");

  const kpi = await one(`SELECT * FROM dashboard_kpi();`);
  const cliAttiviInd = Number((await one(`SELECT count(*)::int n FROM clienti WHERE attivo=true`)).n);
  const verbInd = Number((await one(`SELECT count(*)::int n FROM visite`)).n);
  const ncStd = Number((await one(`SELECT count(*)::int n FROM risposte r JOIN visite v ON v.id=r.visita_id WHERE v.stato_verbale='chiuso' AND r.valore='NC'`)).n);
  const ncImp = Number((await one(`SELECT count(*)::int n FROM risposte_imprese_appalto ria JOIN imprese_appalto ia ON ia.id=ria.impresa_id JOIN visite v ON v.id=ia.visita_id WHERE v.stato_verbale='chiuso' AND ria.esito='NC'`)).n);
  const ultimoInd = (await one(`SELECT max(data_visita) d FROM visite`)).d;
  console.log("  KPI RPC:", JSON.stringify(kpi));
  check("clienti_attivi == conteggio indipendente", Number(kpi.clienti_attivi) === cliAttiviInd, `${kpi.clienti_attivi} vs ${cliAttiviInd}`);
  check("verbali_totali == count(visite)", Number(kpi.verbali_totali) === verbInd, `${kpi.verbali_totali} vs ${verbInd}`);
  check("nc_verbali_chiusi == NC(std)+NC(imprese) nei chiusi", Number(kpi.nc_verbali_chiusi) === ncStd + ncImp, `${kpi.nc_verbali_chiusi} vs ${ncStd}+${ncImp}`);
  check("ultimo_sopralluogo == max(data_visita)", String(kpi.ultimo_sopralluogo) === String(ultimoInd));

  const cl = await all(`SELECT * FROM dashboard_clienti();`);
  let okRollup = cl.length > 0;
  for (const r of cl) {
    const nSedi = Number((await one(`SELECT count(*)::int n FROM sedi WHERE cliente_id=$1 AND attiva=true`, [r.id])).n);
    const nVerb = Number((await one(`SELECT count(*)::int n FROM visite WHERE cliente_id=$1`, [r.id])).n);
    if (Number(r.n_sedi) !== nSedi || Number(r.n_verbali) !== nVerb) okRollup = false;
  }
  check("dashboard_clienti: n_sedi/n_verbali coerenti per ogni cliente", okRollup);

  // Filtro ricerca (logica client-side replicata)
  const filtra = (q) => cl.filter((x) => x.ragione_sociale.toLowerCase().includes(q.toLowerCase()));
  check("ricerca 'pane' trova Pane Pizza", filtra("pane").some((x) => /pane pizza/i.test(x.ragione_sociale)));
  check("ricerca 'zzz_nomatch' → 0 risultati", filtra("zzz_nomatch").length === 0);

  // Regola blocco eliminazione sede: una sede con visite ha count>0
  const sedeConVisite = await one(`SELECT s.id, count(v.id)::int n FROM sedi s JOIN visite v ON v.sede_id=s.id GROUP BY s.id LIMIT 1`);
  check("esiste una sede con visite → eliminazione sarebbe bloccata", sedeConVisite && sedeConVisite.n > 0, sedeConVisite ? `sede ${String(sedeConVisite.id).slice(0,8)} ha ${sedeConVisite.n} visite` : "nessuna");

  // ── PART 2 — round-trip CRUD in transazione (ROLLBACK finale) ────────────
  console.log("\n── PART 2 — CRUD sede in transazione effimera (ROLLBACK) ──");
  await c.query("BEGIN");

  const utente = await one(`SELECT id FROM utenti LIMIT 1`);
  const cli = await one(`INSERT INTO clienti (ragione_sociale, citta, provincia, attivo) VALUES ('ZZZ_TEST_S10','Roma','RM',true) RETURNING id`);
  const sedeA = await one(`INSERT INTO sedi (cliente_id, nome, indirizzo, citta) VALUES ($1,'Sede A','Via A 1','Roma') RETURNING id`, [cli.id]);
  const sedeB = await one(`INSERT INTO sedi (cliente_id, nome, indirizzo, citta) VALUES ($1,'Sede B','Via B 2','Roma') RETURNING id`, [cli.id]);

  // aggiornaSede(A)
  await c.query(`UPDATE sedi SET nome='Sede A bis', referente_sede='Mario' WHERE id=$1`, [sedeA.id]);
  const aAgg = await one(`SELECT nome, referente_sede FROM sedi WHERE id=$1`, [sedeA.id]);
  check("aggiornaSede: nome+referente aggiornati", aAgg.nome === "Sede A bis" && aAgg.referente_sede === "Mario");

  // impostaSedePrincipale(B) = reset others + set B; poi switch su A
  const setPrincipale = async (sedeId) => {
    await c.query(`UPDATE sedi SET principale=false WHERE cliente_id=$1 AND id<>$2`, [cli.id, sedeId]);
    await c.query(`UPDATE sedi SET principale=true WHERE id=$1`, [sedeId]);
  };
  await setPrincipale(sedeB.id);
  let princ = await all(`SELECT id, principale FROM sedi WHERE cliente_id=$1`, [cli.id]);
  check("principale: solo B è principale", princ.filter((x) => x.principale).length === 1 && princ.find((x) => x.id === sedeB.id).principale);
  await setPrincipale(sedeA.id);
  princ = await all(`SELECT id, principale FROM sedi WHERE cliente_id=$1`, [cli.id]);
  check("principale: switch su A, unicità mantenuta", princ.filter((x) => x.principale).length === 1 && princ.find((x) => x.id === sedeA.id).principale);

  // eliminaSede(B): 0 visite → soft-delete consentito
  const visiteB0 = Number((await one(`SELECT count(*)::int n FROM visite WHERE sede_id=$1`, [sedeB.id])).n);
  check("Sede B ha 0 visite", visiteB0 === 0);
  await c.query(`UPDATE sedi SET attiva=false WHERE id=$1`, [sedeB.id]);
  const bAttiva = (await one(`SELECT attiva FROM sedi WHERE id=$1`, [sedeB.id])).attiva;
  check("eliminaSede(B) soft-delete: attiva=false", bAttiva === false);

  // visita su sede A → blocco eliminazione A + blocco eliminazione cliente
  await c.query(
    `INSERT INTO visite (sede_id, cliente_id, specialist_id, data_visita, stato, template_snapshot) VALUES ($1,$2,$3,'2026-06-30','bozza','{}'::jsonb)`,
    [sedeA.id, cli.id, utente.id]
  );
  const visiteA = Number((await one(`SELECT count(*)::int n FROM visite WHERE sede_id=$1`, [sedeA.id])).n);
  check("eliminaSede(A) bloccata: A ha visite collegate", visiteA > 0, `visite=${visiteA}`);
  const visiteCli = Number((await one(`SELECT count(*)::int n FROM visite WHERE cliente_id=$1`, [cli.id])).n);
  check("eliminaCliente bloccata: cliente ha visite collegate", visiteCli > 0, `visite=${visiteCli}`);

  await c.query("ROLLBACK");
  // Verifica che nulla sia persistito
  const orfani = Number((await one(`SELECT count(*)::int n FROM clienti WHERE ragione_sociale='ZZZ_TEST_S10'`)).n);
  check("ROLLBACK: nessuna riga di test persistita", orfani === 0);
} catch (e) {
  try { await c.query("ROLLBACK"); } catch {}
  console.error("ERRORE:", e.message);
  fail = true;
} finally {
  await c.end();
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI I TEST OK");
process.exit(fail ? 1 : 0);
