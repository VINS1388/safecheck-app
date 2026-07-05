/**
 * Fase C2 — trasformazione canonico → applicativo del template HACCP.
 * Verifica che costruisciSnapshotHaccp preservi ID/testi/guida/applicabilità e
 * derivi correttamente i campi strutturali (ordine, obbligatoria, tipo_risposta)
 * e i marker top-level, SENZA riscrivere nulla.
 *
 * Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-fase-c2-snapshot.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  costruisciSnapshotHaccp,
  isHaccpCanon,
  isSnapshotHaccp,
} from "@/lib/checklist/haccpSnapshot";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const canon = JSON.parse(readFileSync(join(ROOT, "seed", "template-haccp-generico-v1.0.json"), "utf8"));

let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }

ck("isHaccpCanon(canonico) = true", isHaccpCanon(canon) === true);
ck("isHaccpCanon(sicurezza-like) = false", isHaccpCanon({ sezioni: [], versione: 6 }) === false);

const snap = costruisciSnapshotHaccp(canon);
ck("isSnapshotHaccp(snapshot) = true", isSnapshotHaccp(snap) === true);
ck("8 sezioni", snap.sezioni.length === 8);
const totDom = snap.sezioni.reduce((n, s) => n + s.domande.length, 0);
ck("46 domande totali", totDom === 46);

// Marker top-level trasportati
ck("tipo_scoring trasportato", snap.tipo_scoring === "haccp_media_sezione");
ck("etichette PC=Migliorabile", snap.etichette?.PC === "Migliorabile");
ck("obbligo_osservazione NC=obbligatoria", snap.obbligo_osservazione?.NC === "obbligatoria");
ck("intestazione_extra (10 campi)", Array.isArray(snap.intestazione_extra) && snap.intestazione_extra.length === 10);
ck("modulo=haccp_generico", snap.modulo === "haccp_generico");

// ID e ordine per sezione e domanda: identici al canonico, in ordine di posizione
let idsOk = true, ordineOk = true, structOk = true, testiOk = true, guidaOk = true, applOk = true;
canon.sezioni.forEach((sc, si) => {
  const ss = snap.sezioni[si];
  if (ss.id !== sc.id || ss.nome !== sc.titolo) idsOk = false;
  if (ss.ordine !== si + 1) ordineOk = false;
  sc.domande.forEach((dc, di) => {
    const ds = ss.domande[di];
    if (!ds || ds.id !== dc.id) idsOk = false;
    if (ds.ordine !== di + 1) ordineOk = false;
    if (ds.obbligatoria !== true || ds.tipo_risposta !== "conformita_5") structOk = false;
    if (ds.testo !== dc.testo || ds.titolo !== dc.titolo) testiOk = false;
    if (JSON.stringify(ds.guida ?? null) !== JSON.stringify(dc.guida ?? null)) guidaOk = false;
    if ((ds.applicabilita ?? null) !== (dc.applicabilita ?? null)) applOk = false;
  });
});
ck("tutti gli ID sezione/domanda preservati", idsOk);
ck("ordine derivato da posizione (1..N)", ordineOk);
ck("ogni domanda: obbligatoria=true, tipo_risposta=conformita_5", structOk);
ck("testi e titoli preservati byte-per-byte", testiOk);
ck("guida valutativa preservata", guidaOk);
ck("criterio applicabilità preservato", applOk);

// note_template NON trasportato nello snapshot (metadato interno)
const haNoteTemplate = snap.sezioni.some((s) => s.domande.some((d) => "note_template" in d));
ck("note_template NON presente nello snapshot (metadato interno)", !haNoteTemplate);

// Spot-check testo integrale di una domanda con applicabilità (D-H01-006)
const d006snap = snap.sezioni.flatMap((s) => s.domande).find((d) => d.id === "D-H01-006");
const d006canon = canon.sezioni.flatMap((s) => s.domande).find((d) => d.id === "D-H01-006");
ck("D-H01-006 testo integrale identico", d006snap.testo === d006canon.testo && d006snap.applicabilita === d006canon.applicabilita);

console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
