/**
 * Sprint 15.2 — Test end-to-end del ciclo di vita slot↔visita in BEGIN…ROLLBACK.
 * Applica la migration 022 dentro la transazione (prod non la ha ancora) e verifica
 * il comportamento a livello DB delle operazioni che le query TS incapsulano:
 *
 *   1. Backfill: gli slot esistenti ereditano il tecnico del piano.
 *   2. Nuovo ciclo (genera_prossimo_ciclo): i nuovi slot ereditano il default.
 *   3. Cambio tecnico su singolo slot: persiste + flag true, non tocca gli altri.
 *   4. Creazione visita con slot selezionato: collegamento immediato (solo visita_id,
 *      stato invariato — Opzione A).
 *   5. Creazione visita "fuori piano": nessun collegamento, nessun errore.
 *   6. Eliminazione bozza collegata: FK ON DELETE SET NULL svincola lo slot, lo
 *      stato è già coerente (mai promosso a 'eseguita').
 *   7. Chiusura verbale con slot collegato: transizione a 'eseguita' per match visita_id.
 *   8. Chiusura verbale FUORI piano: la transizione non tocca alcuno slot (il vecchio
 *      "primo slot libero" è rimosso) — 0 righe, nessun aggancio.
 *   9. Genealogia: clona_visita (sostitutivo) NON eredita il collegamento; la chiusura
 *      del sostitutivo non tocca lo slot dell'originale.
 *  10. Concorrenza: due visite sullo stesso slot → la seconda collegaSlot ottiene 0 righe.
 *
 * Uso: node scripts/test-sprint15-2-slot.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_022 = readFileSync(join(ROOT, "supabase", "migrations", "022_sprint15_2_tecnico_per_slot.sql"), "utf8");

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

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? "  — " + extra : ""}`);
  if (ok) pass++; else fail++;
}

// Helper: replica creaVisita a livello SQL (bozza minima).
async function creaVisita(sedeId, clienteId, specialistId) {
  const r = await c.query(
    `INSERT INTO public.visite (sede_id, cliente_id, specialist_id, template_snapshot, data_visita, stato)
     VALUES ($1,$2,$3,'{}'::jsonb, CURRENT_DATE, 'bozza') RETURNING id`,
    [sedeId, clienteId, specialistId]
  );
  return r.rows[0].id;
}
// Helper: replica collegaSlot (UPDATE atomico, solo visita_id). Ritorna true se collegato.
async function collegaSlot(slotId, visitaId) {
  const r = await c.query(
    `UPDATE public.visite_pianificate SET visita_id=$2
     WHERE id=$1 AND visita_id IS NULL AND stato<>'eseguita' RETURNING id`,
    [slotId, visitaId]
  );
  return r.rowCount > 0;
}
// Helper: replica la transizione di chiusura (blocco 11-bis nuovo).
async function transizioneChiusura(visitaId) {
  const r = await c.query(
    `UPDATE public.visite_pianificate SET stato='eseguita'
     WHERE visita_id=$1 AND stato<>'eseguita' RETURNING id`,
    [visitaId]
  );
  return r.rowCount; // righe toccate
}

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(SQL_022);
  console.log("Migration 022 applicata in transazione.\n");

  const piano = (await c.query(
    `SELECT pv.id, pv.sede_id, s.cliente_id, pv.ciclo_corrente, pv.visite_anno
     FROM public.piani_visite pv JOIN public.sedi s ON s.id = pv.sede_id
     WHERE (SELECT count(*) FROM public.visite_pianificate vp
            WHERE vp.piano_id=pv.id AND vp.ciclo_numero=pv.ciclo_corrente AND vp.stato<>'eseguita') >= 3
     ORDER BY pv.visite_anno DESC LIMIT 1`
  )).rows[0];
  const utenti = (await c.query(
    `SELECT id FROM public.utenti WHERE attivo=true ORDER BY nome_completo LIMIT 2`
  )).rows;
  if (!piano || utenti.length < 2) {
    console.log("⚠️  Dati insufficienti (serve piano con ≥3 slot non eseguiti + 2 utenti).");
    await c.query("ROLLBACK");
    process.exit(1);
  }
  const tecA = utenti[0].id, tecB = utenti[1].id;
  const { sede_id: sedeId, cliente_id: clienteId, ciclo_corrente: ciclo } = piano;

  // Default piano = tecA e propaga ai non-personalizzati → base pulita.
  await c.query(`UPDATE public.piani_visite SET tecnico_assegnato_id=$1 WHERE id=$2`, [tecA, piano.id]);
  await c.query(
    `UPDATE public.visite_pianificate SET tecnico_assegnato_id=$1
     WHERE piano_id=$2 AND ciclo_numero=$3 AND tecnico_personalizzato=false AND stato<>'eseguita'`,
    [tecA, piano.id, ciclo]
  );

  // ── 1. Backfill ──
  const disall = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate vp JOIN public.piani_visite pv ON pv.id=vp.piano_id
     WHERE vp.tecnico_assegnato_id IS DISTINCT FROM pv.tecnico_assegnato_id`
  )).rows[0].n;
  check("1. Backfill: slot esistenti ereditano il tecnico del piano", disall === 0, `disallineati=${disall}`);

  // ── 3. Cambio tecnico su singolo slot ──
  const slots = (await c.query(
    `SELECT id, numero_visita FROM public.visite_pianificate
     WHERE piano_id=$1 AND ciclo_numero=$2 AND stato<>'eseguita' ORDER BY numero_visita`,
    [piano.id, ciclo]
  )).rows;
  const s1 = slots[0], s2 = slots[1], s3 = slots[2];
  await c.query(
    `UPDATE public.visite_pianificate SET tecnico_assegnato_id=$1, tecnico_personalizzato=true WHERE id=$2`,
    [tecB, s1.id]
  );
  const altri = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate
     WHERE piano_id=$1 AND ciclo_numero=$2 AND id<>$3 AND stato<>'eseguita'
       AND tecnico_assegnato_id IS DISTINCT FROM $4`,
    [piano.id, ciclo, s1.id, tecA]
  )).rows[0].n;
  const s1row = (await c.query(`SELECT tecnico_assegnato_id t, tecnico_personalizzato p FROM public.visite_pianificate WHERE id=$1`, [s1.id])).rows[0];
  check("3. Cambio tecnico singolo slot: persiste + flag true", s1row.t === tecB && s1row.p === true, `t=${s1row.t} flag=${s1row.p}`);
  check("3. Cambio tecnico singolo slot: NON tocca gli altri", altri === 0, `altri-non-default=${altri}`);

  // ── 4. Creazione visita con slot selezionato → collegamento immediato ──
  const vSlot = await creaVisita(sedeId, clienteId, tecA);
  const collegato = await collegaSlot(s2.id, vSlot);
  const s2dopo = (await c.query(`SELECT visita_id, stato FROM public.visite_pianificate WHERE id=$1`, [s2.id])).rows[0];
  check("4. Creazione con slot: visita_id collegato", collegato && s2dopo.visita_id === vSlot);
  check("4. Opzione A: stato slot INVARIATO alla creazione (non 'eseguita')", s2dopo.stato !== "eseguita", `stato=${s2dopo.stato}`);
  // Stato derivato "in lavorazione"
  const inLav = s2dopo.visita_id !== null && s2dopo.stato !== "eseguita";
  check("4. Stato derivato 'in lavorazione' attivo", inLav === true);

  // ── 5. Creazione visita fuori piano → nessun collegamento ──
  const vFuori = await creaVisita(sedeId, clienteId, tecA);
  const collegamentiFuori = (await c.query(`SELECT count(*)::int n FROM public.visite_pianificate WHERE visita_id=$1`, [vFuori])).rows[0].n;
  check("5. Creazione fuori piano: nessuno slot collegato", collegamentiFuori === 0);

  // ── 7. Chiusura con slot collegato → 'eseguita' ──
  const toccate7 = await transizioneChiusura(vSlot);
  const s2fin = (await c.query(`SELECT stato FROM public.visite_pianificate WHERE id=$1`, [s2.id])).rows[0].stato;
  check("7. Chiusura con slot: transizione a 'eseguita' (match visita_id)", toccate7 === 1 && s2fin === "eseguita", `toccate=${toccate7} stato=${s2fin}`);

  // ── 8. Chiusura FUORI piano → nessun aggancio (vecchio 'primo slot libero' rimosso) ──
  const liberiPrima = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate WHERE piano_id=$1 AND ciclo_numero=$2 AND visita_id IS NULL AND stato<>'eseguita'`,
    [piano.id, ciclo]
  )).rows[0].n;
  const toccate8 = await transizioneChiusura(vFuori);
  const liberiDopo = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate WHERE piano_id=$1 AND ciclo_numero=$2 AND visita_id IS NULL AND stato<>'eseguita'`,
    [piano.id, ciclo]
  )).rows[0].n;
  check("8. Chiusura fuori piano: NESSUNO slot toccato (aggancio automatico rimosso)", toccate8 === 0 && liberiDopo === liberiPrima, `toccate=${toccate8} liberi ${liberiPrima}→${liberiDopo}`);

  // ── 6. Eliminazione bozza collegata → svincolo via FK, stato coerente ──
  const vDel = await creaVisita(sedeId, clienteId, tecA);
  await collegaSlot(s3.id, vDel);
  const s3prima = (await c.query(`SELECT visita_id, stato FROM public.visite_pianificate WHERE id=$1`, [s3.id])).rows[0];
  await c.query(`DELETE FROM public.visite WHERE id=$1 AND stato='bozza'`, [vDel]); // eliminaVisitaBozza
  const s3dopo = (await c.query(`SELECT visita_id, stato FROM public.visite_pianificate WHERE id=$1`, [s3.id])).rows[0];
  check("6. Eliminazione bozza: FK SET NULL svincola lo slot", s3prima.visita_id === vDel && s3dopo.visita_id === null);
  check("6. Eliminazione bozza: stato slot già coerente (mai 'eseguita')", s3dopo.stato === s3prima.stato && s3dopo.stato !== "eseguita", `stato=${s3dopo.stato}`);

  // ── 9. Genealogia: sostitutivo non eredita collegamento, chiusura non tocca slot originale ──
  // vSlot è chiuso e collegato a s2 (eseguita). Portalo a stato_verbale='chiuso' per realismo.
  await c.query(`UPDATE public.visite SET stato='verbale_generato', stato_verbale='chiuso' WHERE id=$1`, [vSlot]);
  const vSost = (await c.query(`SELECT public.clona_visita($1, true) AS id`, [vSlot])).rows[0].id;
  const slotSuSost = (await c.query(`SELECT count(*)::int n FROM public.visite_pianificate WHERE visita_id=$1`, [vSost])).rows[0].n;
  check("9. Sostitutivo NON eredita alcun collegamento slot", slotSuSost === 0);
  const toccate9 = await transizioneChiusura(vSost); // chiusura del sostitutivo
  const s2ancora = (await c.query(`SELECT visita_id, stato FROM public.visite_pianificate WHERE id=$1`, [s2.id])).rows[0];
  check("9. Chiusura sostitutivo NON tocca lo slot dell'originale", toccate9 === 0 && s2ancora.visita_id === vSlot && s2ancora.stato === "eseguita", `toccate=${toccate9} slot→${s2ancora.visita_id === vSlot ? "originale" : "ALTRO"} stato=${s2ancora.stato}`);

  // ── 10. Concorrenza: due visite sullo stesso slot ──
  const sConc = slots[3];
  const vC1 = await creaVisita(sedeId, clienteId, tecA);
  const vC2 = await creaVisita(sedeId, clienteId, tecB);
  const c1 = await collegaSlot(sConc.id, vC1);
  const c2 = await collegaSlot(sConc.id, vC2); // deve perdere la corsa
  if (!c2) await c.query(`DELETE FROM public.visite WHERE id=$1 AND stato='bozza'`, [vC2]); // compensazione
  const sConcFin = (await c.query(`SELECT visita_id FROM public.visite_pianificate WHERE id=$1`, [sConc.id])).rows[0].visita_id;
  const vC2esiste = (await c.query(`SELECT count(*)::int n FROM public.visite WHERE id=$1`, [vC2])).rows[0].n;
  check("10. Concorrenza: 1° collega, 2° ottiene 0 righe", c1 === true && c2 === false);
  check("10. Concorrenza: slot punta alla 1ª visita, la 2ª bozza è compensata (eliminata)", sConcFin === vC1 && vC2esiste === 0);

  // ── 2. Nuovo ciclo: eredità default ──
  await c.query(`SELECT public.genera_prossimo_ciclo($1)`, [piano.id]);
  const nuovo = (await c.query(`SELECT ciclo_corrente c FROM public.piani_visite WHERE id=$1`, [piano.id])).rows[0].c;
  const nuoviAnomali = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate
     WHERE piano_id=$1 AND ciclo_numero=$2 AND (tecnico_assegnato_id IS DISTINCT FROM $3 OR tecnico_personalizzato<>false)`,
    [piano.id, nuovo, tecA]
  )).rows[0].n;
  check("2. Nuovo ciclo: slot ereditano default (tecA) + flag false", nuoviAnomali === 0, `ciclo=${nuovo} anomali=${nuoviAnomali}`);

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK eseguito — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
