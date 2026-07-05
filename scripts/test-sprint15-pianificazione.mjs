// Test Sprint 15 — pianificazione visite. Transazione NON persistente
// (BEGIN…ROLLBACK, migration 021 applicata dentro la transazione).
// Copre: generazione slot, ricalcolo parziale (slot eseguito intatto), aggancio
// automatico alla chiusura (sede con piano / senza piano), genera prossimo ciclo.
//
// L'aggancio replica la QUERY della route genera-pdf/route.ts (primo slot libero
// per sede, ordinato per ciclo/numero → eseguita + visita_id).
//
// Uso: node scripts/test-sprint15-pianificazione.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function dbUrl() { for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i < 0) continue; if (l.slice(0, i).trim() === "DATABASE_URL") return l.slice(i + 1).trim().replace(/^["']|["']$/g, ""); } throw new Error("no url"); }
const u = new URL(dbUrl());
const c = new pg.Client({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: "postgres.yrgpowaflmcwwspffjip", password: decodeURIComponent(u.password), database: "postgres", ssl: { rejectUnauthorized: false } });
const one = async (s, p = []) => (await c.query(s, p)).rows[0];
const all = async (s, p = []) => (await c.query(s, p)).rows;
let fail = false;
const check = (n, ok, x = "") => { console.log(`  ${ok ? "✓" : "✗"} ${n}${x ? " — " + x : ""}`); if (!ok) fail = true; };

// Replica dell'aggancio automatico della route (best-effort): primo slot libero.
async function aggancia(sedeId, visitaId) {
  const r = await one(
    `WITH s AS (
       SELECT id FROM visite_pianificate
       WHERE sede_id=$1 AND stato IN ('da_pianificare','pianificata')
       ORDER BY ciclo_numero, numero_visita LIMIT 1
     )
     UPDATE visite_pianificate vp SET visita_id=$2, stato='eseguita'
     FROM s WHERE vp.id=s.id RETURNING vp.id`,
    [sedeId, visitaId]
  );
  return r?.id ?? null;
}

await c.connect();
try {
  await c.query("BEGIN");
  // La 021 può essere già applicata in prod → in tal caso NON la riapplichiamo
  // (CREATE TYPE/TABLE fallirebbero); usiamo lo schema esistente in transazione.
  const giaApplicata = (await one(`SELECT to_regclass('public.piani_visite') t`)).t != null;
  if (!giaApplicata) {
    await c.query(readFileSync(join(ROOT, "supabase/migrations/021_sprint15_pianificazione.sql"), "utf8"));
  }

  const base = await one(`SELECT cliente_id FROM sedi LIMIT 1`);
  const utente = await one(`SELECT id FROM utenti WHERE attivo=true LIMIT 1`);
  // Sedi di test FRESCHE nella transazione (evita collisioni con piani reali di
  // prod: piani_visite.sede_id è UNIQUE). Tutto rolled back a fine test.
  const sede = await one(
    `INSERT INTO sedi (cliente_id, nome, indirizzo, citta, attiva, principale)
     VALUES ($1,'Sede piano test','Via Test 1','Palermo',true,false) RETURNING id, cliente_id`,
    [base.cliente_id]
  );
  const sedeNoPiano = await one(
    `INSERT INTO sedi (cliente_id, nome, indirizzo, citta, attiva, principale)
     VALUES ($1,'Sede senza piano','Via Test 2','Palermo',true,false) RETURNING id`,
    [base.cliente_id]
  );

  // ── SCENARIO A — creazione piano 2 visite/anno ────────────────────────────
  console.log("── A — creazione piano (2 visite/anno) ──");
  const piano = await one(`INSERT INTO piani_visite (sede_id, data_inizio_ciclo, visite_anno, tecnico_assegnato_id, modulo_id) VALUES ($1,'2026-03-01',2,$2,'a0000000-0000-4000-8000-000000000001') RETURNING id`, [sede.id, utente.id]);
  await one(`SELECT genera_slot_ciclo($1,$2,1,'2026-03-01',2) n`, [piano.id, sede.id]);
  let slots = await all(`SELECT numero_visita nv, data_suggerita::text d, stato FROM visite_pianificate WHERE piano_id=$1 ORDER BY numero_visita`, [piano.id]);
  check("2 slot @2026-03-01 e 2026-09-01, da_pianificare", slots.length === 2 && slots[0].d === "2026-03-01" && slots[1].d === "2026-09-01" && slots.every(s => s.stato === "da_pianificare"));

  // ── SCENARIO B — aggancio automatico (sede CON piano) ─────────────────────
  console.log("\n── B — aggancio automatico alla chiusura (sede con piano) ──");
  const visita1 = await one(
    `INSERT INTO visite (sede_id, cliente_id, specialist_id, modulo_id, data_visita, stato, stato_verbale, template_snapshot)
     VALUES ($1,$2,$3,'a0000000-0000-4000-8000-000000000001','2026-03-05','verbale_generato','chiuso','{}'::jsonb) RETURNING id`,
    [sede.id, sede.cliente_id, utente.id]
  );
  const agg = await aggancia(sede.id, visita1.id);
  check("aggancio: uno slot agganciato", agg !== null);
  const s1 = await one(`SELECT numero_visita nv, stato, visita_id FROM visite_pianificate WHERE id=$1`, [agg]);
  check("slot agganciato = numero_visita 1 (primo libero)", s1.nv === 1);
  check("slot → eseguita + visita_id = verbale", s1.stato === "eseguita" && s1.visita_id === visita1.id);

  // ── SCENARIO C — aggancio con sede SENZA piano (nessun side-effect) ───────
  console.log("\n── C — chiusura sede SENZA piano (nessun errore, nessun aggancio) ──");
  const visita2 = await one(
    `INSERT INTO visite (sede_id, cliente_id, specialist_id, modulo_id, data_visita, stato, stato_verbale, template_snapshot)
     VALUES ($1,$2,$3,'a0000000-0000-4000-8000-000000000001','2026-04-01','verbale_generato','chiuso','{}'::jsonb) RETURNING id`,
    [sedeNoPiano.id, sede.cliente_id, utente.id]
  );
  const aggNone = await aggancia(sedeNoPiano.id, visita2.id);
  check("nessuno slot agganciato (sede senza piano) → null, nessun errore", aggNone === null);

  // ── SCENARIO D — modifica piano a metà ciclo (2→4) con 1 slot eseguito ────
  console.log("\n── D — ricalcolo a metà ciclo (2→4), slot eseguito intatto ──");
  // slot 1 è già eseguito (agganciato in B). Ricalcolo a 4 visite/anno.
  // Come salvaPiano: prima aggiorna la config del piano, poi ricalcola gli slot.
  await c.query(`UPDATE piani_visite SET visite_anno=4 WHERE id=$1`, [piano.id]);
  const nuovi = (await one(`SELECT ricalcola_slot_ciclo($1,$2,1,'2026-03-01',4) n`, [piano.id, sede.id])).n;
  check("ricalcolo → 3 nuovi slot (2,3,4)", nuovi === 3, `${nuovi}`);
  slots = await all(`SELECT numero_visita nv, data_suggerita::text d, stato, visita_id FROM visite_pianificate WHERE piano_id=$1 AND ciclo_numero=1 ORDER BY numero_visita`, [piano.id]);
  check("totale 4 slot nel ciclo", slots.length === 4);
  check("slot 1 eseguito INTATTO (eseguita, visita agganciata)", slots[0].nv === 1 && slots[0].stato === "eseguita" && slots[0].visita_id === visita1.id);
  check("slot 2/3/4 rigenerati @06/09/12, da_pianificare", slots[1].d === "2026-06-01" && slots[2].d === "2026-09-01" && slots[3].d === "2026-12-01" && slots.slice(1).every(s => s.stato === "da_pianificare"));

  // ── SCENARIO E — genera prossimo ciclo (ciclo interamente eseguito) ───────
  console.log("\n── E — genera prossimo ciclo ──");
  await c.query(`UPDATE visite_pianificate SET stato='eseguita' WHERE piano_id=$1 AND ciclo_numero=1`, [piano.id]);
  const nCiclo2 = (await one(`SELECT genera_prossimo_ciclo($1) n`, [piano.id])).n;
  check("genera_prossimo_ciclo → 4 slot (visite_anno corrente)", nCiclo2 === 4, `${nCiclo2}`);
  const p = await one(`SELECT ciclo_corrente, data_inizio_ciclo::text d FROM piani_visite WHERE id=$1`, [piano.id]);
  check("piano → ciclo_corrente 2, data_inizio 2027-03-01", p.ciclo_corrente === 2 && p.d === "2027-03-01", p.d);
  const c2 = await all(`SELECT data_suggerita::text d, stato FROM visite_pianificate WHERE piano_id=$1 AND ciclo_numero=2 ORDER BY numero_visita`, [piano.id]);
  check("ciclo 2: 4 slot da 2027-03-01, da_pianificare", c2.length === 4 && c2[0].d === "2027-03-01" && c2.every(s => s.stato === "da_pianificare"));
  const c1done = await all(`SELECT stato FROM visite_pianificate WHERE piano_id=$1 AND ciclo_numero=1`, [piano.id]);
  check("ciclo 1 intatto (tutti eseguiti)", c1done.every(s => s.stato === "eseguita"));

  await c.query("ROLLBACK");
  if (giaApplicata) {
    // Le tabelle esistono in prod: verifico che i DATI di test siano stati annullati.
    const rimasti = (await one(`SELECT count(*)::int n FROM piani_visite WHERE id=$1`, [piano.id])).n;
    check("dopo ROLLBACK: dati di test non persistiti", rimasti === 0);
  } else {
    const exists = (await one(`SELECT to_regclass('public.piani_visite') t`)).t;
    check("dopo ROLLBACK: tabelle non persistite", exists === null);
  }
} finally { await c.end(); }
console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
