// Test Sprint 11 — Duplica / Crea sostitutivo (genealogia).
// Tutto dentro UNA transazione con ROLLBACK finale → nessuna scrittura
// persistente. Esercita la RPC reale clona_visita(uuid, boolean) e replica
// i guard delle route (stato_verbale / sostituito_da) per gli scenari di blocco.
//
// Uso: node scripts/test-sprint11.mjs
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

// Guard delle route (replica TypeScript → SQL-side per il test).
const canDuplica = (v) => v.stato_verbale === "chiuso";
const canSostitutivo = (v) => v.stato_verbale === "chiuso" && v.sostituito_da == null;

await c.connect();
try {
  await c.query("BEGIN");

  const sede = await one(`SELECT id, cliente_id FROM sedi LIMIT 1`);
  const utente = await one(`SELECT id FROM utenti LIMIT 1`);

  // Sorgente: verbale CHIUSO con risposte standard (+ riga nominativi) e, per
  // lo scenario B, 3 imprese SEZ-08 con risposte miste.
  async function creaSorgente(conImprese) {
    const src = await one(
      `INSERT INTO visite (sede_id, cliente_id, specialist_id, data_visita, stato, stato_verbale, numero_verbale, note_conclusive, template_snapshot)
       VALUES ($1,$2,$3,'2026-01-15','verbale_generato','chiuso',$4,'Note finali di test.','{"sezioni":[]}'::jsonb) RETURNING id`,
      [sede.id, sede.cliente_id, utente.id, "SC-9999-" + Math.floor(Math.random() * 1e6)]
    );
    await c.query(
      `INSERT INTO risposte (visita_id, domanda_id, sezione_id, valore, azione_correttiva) VALUES
        ($1,'D-01-001','SEZ-01','C',NULL),
        ($1,'D-02-001','SEZ-02','NC','Azione correttiva di test.')`,
      [src.id]
    );
    // Riga sintetica nominativi (campo_extra jsonb)
    await c.query(
      `INSERT INTO risposte (visita_id, domanda_id, sezione_id, valore, campo_extra) VALUES ($1,'SEZ-01-NOMINATIVI','SEZ-01',NULL,'{"DL":"Mario Verdi"}'::jsonb)`,
      [src.id]
    );
    const impreseIds = [];
    if (conImprese) {
      for (let i = 0; i < 3; i++) {
        const imp = await one(
          `INSERT INTO imprese_appalto (visita_id, ragione_sociale, tipo_impresa, ordine) VALUES ($1,$2,'appaltatrice',$3) RETURNING id`,
          [src.id, `Impresa ${i + 1}`, i]
        );
        impreseIds.push(imp.id);
        await c.query(
          `INSERT INTO risposte_imprese_appalto (impresa_id, domanda_id, esito, azione_correttiva) VALUES
            ($1,'D-08-002',$2,$3),
            ($1,'D-08-003','C',NULL)`,
          [imp.id, i === 1 ? "NC" : "C", i === 1 ? "Azione impresa." : null]
        );
      }
    }
    return { id: src.id, impreseIds };
  }

  // ── SCENARIO A — Duplica da chiuso, sole risposte standard ────────────────
  console.log("── SCENARIO A — Duplica (risposte standard) ──");
  {
    const src = await creaSorgente(false);
    const newId = (await one(`SELECT clona_visita($1,false) AS id`, [src.id])).id;
    const nv = await one(`SELECT * FROM visite WHERE id=$1`, [newId]);
    check("nuovo stato=bozza, stato_verbale NULL", nv.stato === "bozza" && nv.stato_verbale === null);
    check("nuovo numero_verbale NULL", nv.numero_verbale === null);
    check("derivato_da = sorgente, sostituisce/sostituito_da NULL", nv.derivato_da === src.id && !nv.sostituisce && !nv.sostituito_da);
    const dvOk = (await one(`SELECT (data_visita = CURRENT_DATE) AS ok FROM visite WHERE id=$1`, [newId])).ok;
    check("data_visita = oggi (CURRENT_DATE)", dvOk === true);
    const rs = await one(`SELECT count(*)::int n FROM risposte WHERE visita_id=$1`, [src.id]);
    const rn = await one(`SELECT count(*)::int n FROM risposte WHERE visita_id=$1`, [newId]);
    check("risposte clonate (stesso numero)", rs.n === rn.n && rn.n === 3, `${rn.n}`);
    const nom = await one(`SELECT campo_extra->>'DL' AS dl FROM risposte WHERE visita_id=$1 AND domanda_id='SEZ-01-NOMINATIVI'`, [newId]);
    check("riga nominativi clonata (campo_extra)", nom?.dl === "Mario Verdi");
    const srcAfter = await one(`SELECT stato_verbale, derivato_da, sostituito_da FROM visite WHERE id=$1`, [src.id]);
    check("sorgente invariato (ancora chiuso, nessuna genealogia)", srcAfter.stato_verbale === "chiuso" && !srcAfter.derivato_da && !srcAfter.sostituito_da);
  }

  // ── SCENARIO B — Duplica da chiuso con SEZ-08 multi-impresa ───────────────
  console.log("\n── SCENARIO B — Duplica (SEZ-08 multi-impresa, 3 imprese) ──");
  let srcB;
  {
    srcB = await creaSorgente(true);
    const newId = (await one(`SELECT clona_visita($1,false) AS id`, [srcB.id])).id;
    const impNew = await all(`SELECT id, ragione_sociale, ordine FROM imprese_appalto WHERE visita_id=$1 ORDER BY ordine`, [newId]);
    check("3 imprese clonate", impNew.length === 3);
    const overlap = impNew.some((x) => srcB.impreseIds.includes(x.id));
    check("nuovi impresa_id distinti dagli originali", !overlap);
    let okRisp = true;
    for (const imp of impNew) {
      const n = Number((await one(`SELECT count(*)::int n FROM risposte_imprese_appalto WHERE impresa_id=$1`, [imp.id])).n);
      if (n !== 2) okRisp = false;
    }
    check("ogni impresa clonata ha le sue 2 risposte", okRisp);
    const ncNew = Number((await one(`SELECT count(*)::int n FROM risposte_imprese_appalto ria JOIN imprese_appalto ia ON ia.id=ria.impresa_id WHERE ia.visita_id=$1 AND ria.esito='NC'`, [newId])).n);
    check("esiti per-impresa preservati (1 NC come nell'originale)", ncNew === 1, `NC=${ncNew}`);
  }

  // ── SCENARIO C — Duplica ripetuta, nessun blocco ─────────────────────────
  console.log("\n── SCENARIO C — Duplica ripetuta (nessun limite) ──");
  {
    const src = await creaSorgente(false);
    const a = (await one(`SELECT clona_visita($1,false) AS id`, [src.id])).id;
    const b = (await one(`SELECT clona_visita($1,false) AS id`, [src.id])).id;
    const d = (await one(`SELECT clona_visita($1,false) AS id`, [src.id])).id;
    check("3 duplicazioni → 3 id distinti", new Set([a, b, d]).size === 3);
    const srcAfter = await one(`SELECT stato_verbale FROM visite WHERE id=$1`, [src.id]);
    check("sorgente ancora chiuso dopo duplicazioni multiple", srcAfter.stato_verbale === "chiuso");
  }

  // ── SCENARIO D — Crea sostitutivo ────────────────────────────────────────
  console.log("\n── SCENARIO D — Crea sostitutivo ──");
  let srcD, subD;
  {
    srcD = await creaSorgente(false);
    subD = (await one(`SELECT clona_visita($1,true) AS id`, [srcD.id])).id;
    const nv = await one(`SELECT * FROM visite WHERE id=$1`, [subD]);
    check("sostitutivo: sostituisce=sorgente, derivato_da NULL, bozza", nv.sostituisce === srcD.id && !nv.derivato_da && nv.stato === "bozza" && nv.stato_verbale === null);
    const srcAfter = await one(`SELECT stato_verbale, sostituito_da FROM visite WHERE id=$1`, [srcD.id]);
    check("sorgente → sostituito + sostituito_da = nuovo", srcAfter.stato_verbale === "sostituito" && srcAfter.sostituito_da === subD);
  }

  // ── SCENARIO E — Secondo sostitutivo bloccato (guard route) ──────────────
  console.log("\n── SCENARIO E — Secondo sostitutivo bloccato ──");
  {
    const srcAfter = await one(`SELECT stato_verbale, sostituito_da FROM visite WHERE id=$1`, [srcD.id]);
    check("guard route: canSostitutivo(sorgente già sostituito) = false → 403", canSostitutivo(srcAfter) === false);
    check("guard route: canDuplica(sostituito) = false → 403", canDuplica(srcAfter) === false);
  }

  // ── SCENARIO F — Blocco su bozza e su sostituito ─────────────────────────
  console.log("\n── SCENARIO F — Blocco Duplica/Sostitutivo su bozza e sostituito ──");
  {
    const bozza = await one(
      `INSERT INTO visite (sede_id, cliente_id, specialist_id, data_visita, stato, template_snapshot) VALUES ($1,$2,$3,'2026-06-30','bozza','{}'::jsonb) RETURNING stato_verbale, sostituito_da`,
      [sede.id, sede.cliente_id, utente.id]
    );
    check("bozza: canDuplica=false, canSostitutivo=false → 403", !canDuplica(bozza) && !canSostitutivo(bozza));
    const sost = await one(`SELECT stato_verbale, sostituito_da FROM visite WHERE id=$1`, [srcD.id]); // srcD è 'sostituito'
    check("sostituito: canDuplica=false, canSostitutivo=false → 403", !canDuplica(sost) && !canSostitutivo(sost));
  }

  // ── SCENARIO G — PDF originale non toccato ───────────────────────────────
  console.log("\n── SCENARIO G — Integrità PDF originale ──");
  {
    const src = await creaSorgente(false);
    await c.query(
      `INSERT INTO verbali_pdf (visita_id, storage_path, sha256_hash, numero_versione, generato_da) VALUES ($1,$2,'abc123',1,$3)`,
      [src.id, `${src.id}/SC-TEST.pdf`, utente.id]
    );
    const before = await one(`SELECT storage_path, sha256_hash FROM verbali_pdf WHERE visita_id=$1`, [src.id]);
    const dup = (await one(`SELECT clona_visita($1,false) AS id`, [src.id])).id;
    const sub = (await one(`SELECT clona_visita($1,true) AS id`, [src.id])).id;
    const after = await one(`SELECT storage_path, sha256_hash FROM verbali_pdf WHERE visita_id=$1`, [src.id]);
    check("verbali_pdf sorgente invariato dopo duplica+sostitutivo", before.storage_path === after.storage_path && before.sha256_hash === after.sha256_hash);
    const nNew = Number((await one(`SELECT count(*)::int n FROM verbali_pdf WHERE visita_id IN ($1,$2)`, [dup, sub])).n);
    check("i nuovi verbali non hanno alcun PDF (count=0)", nNew === 0);
  }

  await c.query("ROLLBACK");
  const orfani = Number((await one(`SELECT count(*)::int n FROM visite WHERE numero_verbale LIKE 'SC-9999-%'`)).n);
  check("ROLLBACK: nessun verbale di test persistito", orfani === 0);
} catch (e) {
  try { await c.query("ROLLBACK"); } catch {}
  console.error("ERRORE:", e.message);
  fail = true;
} finally {
  await c.end();
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
