/**
 * Verifica migration 022 in BEGIN…ROLLBACK (non persiste nulla su prod).
 * Applica il DDL/funzioni della 022 dentro una transazione e verifica:
 *  1. Backfill: gli slot esistenti ereditano il tecnico del piano padre.
 *  2. updateDataPianificata (solo data+stato) NON tocca il tecnico dello slot.
 *  3. Ricalcolo STRUTTURALE — preservazione per numero_visita:
 *     a) slot con tecnico_personalizzato=true lo mantiene (tecnico + flag);
 *     b) slot non personalizzato eredita il default corrente;
 *     c) data_pianificata personalizzata viene ripristinata (bug Sprint 15);
 *     f) flag tecnico_personalizzato preservato per numero_visita matching.
 *  4. genera_prossimo_ciclo: i nuovi slot ereditano il default del piano.
 *  3d. Cambio SOLO default (via salvaPiano logic simulata): slot non
 *      personalizzati si aggiornano, personalizzati intatti, nessuna
 *      rigenerazione (stessi id slot prima/dopo).
 *  3e. Slot personalizzato alla STESSA persona del default: sopravvive al
 *      cambio default (il flag lo protegge, non il confronto valori).
 *  3g. Backfill: tutti gli slot esistenti → tecnico_personalizzato = false.
 *
 * Semantica definitiva (flag esplicito): il default propaga ai soli slot
 * tecnico_personalizzato=false; gli slot con flag true (assegnati a mano dal
 * planner) non seguono più il default. Nessuna inferenza per confronto valori.
 *
 * Uso: node scripts/verify-migration-022.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL = readFileSync(join(ROOT, "supabase", "migrations", "022_sprint15_2_tecnico_per_slot.sql"), "utf8");

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

await c.connect();
try {
  await c.query("BEGIN");
  await c.query(SQL);
  console.log("Migration 022 applicata in transazione.\n");

  // 1. Backfill (tecnico + flag)
  const orfani = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate vp
     JOIN public.piani_visite pv ON pv.id = vp.piano_id
     WHERE vp.tecnico_assegnato_id IS DISTINCT FROM pv.tecnico_assegnato_id`
  )).rows[0].n;
  check("Backfill: ogni slot esistente = tecnico del piano", orfani === 0, `disallineati=${orfani}`);
  const flagTrue = (await c.query(
    `SELECT count(*)::int n FROM public.visite_pianificate WHERE tecnico_personalizzato = true`
  )).rows[0].n;
  check("3g: backfill → tutti gli slot tecnico_personalizzato = false", flagTrue === 0, `flag_true=${flagTrue}`);

  // Serve un piano con ≥3 slot non eseguiti nel ciclo corrente + 2 utenti distinti.
  const piano = (await c.query(
    `SELECT p.id, p.sede_id, p.ciclo_corrente, p.data_inizio_ciclo, p.visite_anno
     FROM public.piani_visite p
     WHERE (SELECT count(*) FROM public.visite_pianificate vp
            WHERE vp.piano_id=p.id AND vp.ciclo_numero=p.ciclo_corrente AND vp.stato<>'eseguita') >= 3
     ORDER BY p.visite_anno DESC LIMIT 1`
  )).rows[0];
  const utenti = (await c.query(
    `SELECT id FROM public.utenti WHERE attivo = true ORDER BY nome_completo LIMIT 2`
  )).rows;

  if (!piano || utenti.length < 2) {
    console.log(`⚠️  Test dinamici saltati: serve un piano con ≥3 slot non eseguiti e ≥2 utenti attivi (piano=${!!piano}, utenti=${utenti.length}).`);
  } else {
    const tecA = utenti[0].id; // default piano
    const tecB = utenti[1].id; // personalizzazione per-slot

    // Normalizza: default piano = tecA, e propaga a tutti i non-personalizzati
    // (mirror del percorso "solo tecnico" di salvaPiano) → tutti tecA/false.
    await c.query(`UPDATE public.piani_visite SET tecnico_assegnato_id=$1 WHERE id=$2`, [tecA, piano.id]);
    await c.query(
      `UPDATE public.visite_pianificate SET tecnico_assegnato_id=$1
       WHERE piano_id=$2 AND ciclo_numero=$3 AND tecnico_personalizzato=false AND stato<>'eseguita'`,
      [tecA, piano.id, piano.ciclo_corrente]
    );

    const slots = (await c.query(
      `SELECT id, numero_visita FROM public.visite_pianificate
       WHERE piano_id=$1 AND ciclo_numero=$2 AND stato<>'eseguita'
       ORDER BY numero_visita`,
      [piano.id, piano.ciclo_corrente]
    )).rows;
    const sPers = slots[0];    // personalizzato a tecB (≠ default) + data_pianificata
    const sSame = slots[1];    // personalizzato alla STESSA persona del default (tecA)
    const sFollow = slots[2];  // NON personalizzato → segue il default

    // sPers: personalizzato tecB, flag true, con data.
    await c.query(
      `UPDATE public.visite_pianificate SET tecnico_assegnato_id=$1, tecnico_personalizzato=true, data_pianificata='2026-10-01', stato='pianificata' WHERE id=$2`,
      [tecB, sPers.id]
    );
    // sSame: personalizzato ma allo STESSO valore del default corrente (tecA), flag true.
    await c.query(
      `UPDATE public.visite_pianificate SET tecnico_assegnato_id=$1, tecnico_personalizzato=true WHERE id=$2`,
      [tecA, sSame.id]
    );

    // 2. updateDataPianificata (solo data+stato) NON tocca tecnico né flag.
    await c.query(
      `UPDATE public.visite_pianificate SET data_pianificata='2026-10-15', stato='pianificata' WHERE id=$1 AND stato<>'eseguita'`,
      [sPers.id]
    );
    const rowUpd = (await c.query(
      `SELECT tecnico_assegnato_id t, tecnico_personalizzato p FROM public.visite_pianificate WHERE id=$1`, [sPers.id]
    )).rows[0];
    check("updateDataPianificata NON tocca tecnico né flag dello slot",
      rowUpd.t === tecB && rowUpd.p === true, `t=${rowUpd.t} flag=${rowUpd.p}`);

    // 3. Ricalcolo STRUTTURALE (stessa data/numero: aritmetica invariata, ma passa dal DELETE+regenerate).
    await c.query(
      `SELECT public.ricalcola_slot_ciclo($1,$2,$3,$4::date,$5)`,
      [piano.id, piano.sede_id, piano.ciclo_corrente, piano.data_inizio_ciclo, piano.visite_anno]
    );
    const rPers = (await c.query(
      `SELECT tecnico_assegnato_id t, tecnico_personalizzato p, data_pianificata::text d FROM public.visite_pianificate
       WHERE piano_id=$1 AND ciclo_numero=$2 AND numero_visita=$3`,
      [piano.id, piano.ciclo_corrente, sPers.numero_visita]
    )).rows[0];
    const rFollow = (await c.query(
      `SELECT tecnico_assegnato_id t, tecnico_personalizzato p FROM public.visite_pianificate
       WHERE piano_id=$1 AND ciclo_numero=$2 AND numero_visita=$3`,
      [piano.id, piano.ciclo_corrente, sFollow.numero_visita]
    )).rows[0];

    check("Ricalcolo 3a: tecnico personalizzato preservato", rPers?.t === tecB,
      `atteso=${tecB} ottenuto=${rPers?.t}`);
    check("Ricalcolo 3f: flag tecnico_personalizzato preservato", rPers?.p === true, `flag=${rPers?.p}`);
    check("Ricalcolo 3b: slot non personalizzato eredita il default corrente", rFollow?.t === tecA && rFollow?.p === false,
      `t=${rFollow?.t} flag=${rFollow?.p}`);
    check("Ricalcolo 3c: data_pianificata ripristinata (bug Sprint 15 corretto)",
      rPers?.d === "2026-10-15", `data=${rPers?.d}`);

    // 3d + 3e. Cambio SOLO default (mirror del percorso "solo tecnico" di salvaPiano):
    // default tecA → NULL. Nessuna rigenerazione: gli id degli slot restano identici.
    const idsPrima = (await c.query(
      `SELECT id FROM public.visite_pianificate WHERE piano_id=$1 AND ciclo_numero=$2 ORDER BY numero_visita`,
      [piano.id, piano.ciclo_corrente]
    )).rows.map((r) => r.id).join(",");
    await c.query(`UPDATE public.piani_visite SET tecnico_assegnato_id=NULL WHERE id=$1`, [piano.id]);
    await c.query(
      `UPDATE public.visite_pianificate SET tecnico_assegnato_id=NULL
       WHERE piano_id=$1 AND ciclo_numero=$2 AND tecnico_personalizzato=false AND stato<>'eseguita'`,
      [piano.id, piano.ciclo_corrente]
    );
    const idsDopo = (await c.query(
      `SELECT id FROM public.visite_pianificate WHERE piano_id=$1 AND ciclo_numero=$2 ORDER BY numero_visita`,
      [piano.id, piano.ciclo_corrente]
    )).rows.map((r) => r.id).join(",");
    // Nota: il ricalcolo precedente ha fatto DELETE+regenerate → gli id degli slot
    // sono cambiati. Si rileggono per numero_visita (stabile).
    const byNum = async (num) => (await c.query(
      `SELECT tecnico_assegnato_id t, tecnico_personalizzato p FROM public.visite_pianificate
       WHERE piano_id=$1 AND ciclo_numero=$2 AND numero_visita=$3`,
      [piano.id, piano.ciclo_corrente, num]
    )).rows[0];
    const dFollow = (await byNum(sFollow.numero_visita)).t;
    const dSame = await byNum(sSame.numero_visita);
    const dPers = (await byNum(sPers.numero_visita)).t;

    check("3d: cambio solo default → nessuna rigenerazione (id slot invariati)", idsPrima === idsDopo);
    check("3d: cambio solo default → slot non personalizzato segue il nuovo default (NULL)", dFollow === null,
      `t=${dFollow}`);
    check("3d: cambio solo default → slot personalizzato intatto", dPers === tecB, `t=${dPers}`);
    check("3e: slot personalizzato alla stessa persona del default sopravvive al cambio default",
      dSame.t === tecA && dSame.p === true, `t=${dSame.t} flag=${dSame.p}`);

    // 4. Nuovo ciclo: i nuovi slot ereditano il default corrente (ora NULL) + flag false.
    await c.query(`UPDATE public.piani_visite SET tecnico_assegnato_id=$1 WHERE id=$2`, [tecA, piano.id]);
    await c.query(`SELECT public.genera_prossimo_ciclo($1)`, [piano.id]);
    const nuovo = (await c.query(`SELECT ciclo_corrente c FROM public.piani_visite WHERE id=$1`, [piano.id])).rows[0].c;
    const nuoviAnomali = (await c.query(
      `SELECT count(*)::int n FROM public.visite_pianificate
       WHERE piano_id=$1 AND ciclo_numero=$2 AND (tecnico_assegnato_id IS DISTINCT FROM $3 OR tecnico_personalizzato <> false)`,
      [piano.id, nuovo, tecA]
    )).rows[0].n;
    check("genera_prossimo_ciclo: nuovi slot ereditano default (tecA) + flag false", nuoviAnomali === 0,
      `ciclo=${nuovo} anomali=${nuoviAnomali}`);
  }

  console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  console.log("ROLLBACK eseguito — nessuna modifica persistita.");
}
process.exit(fail === 0 ? 0 : 1);
