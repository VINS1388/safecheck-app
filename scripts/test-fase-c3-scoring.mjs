/**
 * Fase C3 — motore scoring haccp_media_sezione (Sprint HACCP 2). Unit test PURO.
 * Casi: tutte C, mix, sezione tutta NA (esclusa), sezione tutta NV (esclusa),
 * NV numerosi, nessuna valutabile, arrotondamenti, ordine rilievi (NC poi PC).
 *
 * Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-fase-c3-scoring.mjs
 */
import {
  calcolaPunteggiHaccp,
  conteggiHaccp,
  riepilogoHaccp,
  analizzaHaccp,
} from "@/lib/checklist/scoringHaccp";

let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }
const v = (sez, id, val, extra = {}) => ({ sezioneId: sez, domandaId: id, valore: val, ...extra });
const punt = (voci, ord) => calcolaPunteggiHaccp(voci, ord);
const sezP = (r, sid) => r.sezioni.find((s) => s.sezioneId === sid);

console.log("[A] tutte C → 100 / 100, livello 100");
{
  const r = punt([v("H01", "d1", "C"), v("H01", "d2", "C"), v("H02", "d3", "C")], ["H01", "H02"]);
  ck("H01 = 100", sezP(r, "H01").punteggio === 100);
  ck("H02 = 100", sezP(r, "H02").punteggio === 100);
  ck("livello complessivo 100", r.livelloComplessivo === 100);
}

console.log("\n[B] mix C/PC/NC in una sezione → 50");
{
  const voci = [v("H01", "d1", "C"), v("H01", "d2", "PC"), v("H01", "d3", "NC")];
  const r = punt(voci, ["H01"]);
  ck("H01 = (1+0.5+0)/3*100 = 50", sezP(r, "H01").punteggio === 50);
  ck("valutate = 3", sezP(r, "H01").valutate === 3);
  ck("livello 50", r.livelloComplessivo === 50);
  const rep = riepilogoHaccp(voci);
  ck("sezioniConNC = [H01]", rep.sezioniConNC.length === 1 && rep.sezioniConNC[0] === "H01");
  ck("rilievi: NC prima di PC", rep.rilievi.length === 2 && rep.rilievi[0].esito === "NC" && rep.rilievi[1].esito === "PC");
}

console.log("\n[C] sezione tutta NA → esclusa dal denominatore e dal livello");
{
  const r = punt([v("H01", "d1", "C"), v("H02", "d2", "NA"), v("H02", "d3", "NA")], ["H01", "H02"]);
  ck("H01 = 100 (valutate 1)", sezP(r, "H01").punteggio === 100 && sezP(r, "H01").valutate === 1);
  ck("H02 = null (0 valutabili)", sezP(r, "H02").punteggio === null && sezP(r, "H02").valutate === 0);
  ck("livello = 100 (solo H01)", r.livelloComplessivo === 100);
}

console.log("\n[D] sezione tutta NV → esclusa; nvRilevanti");
{
  const voci = [v("H01", "d1", "C"), v("H02", "d2", "NV", { motivazione: "area chiusa" }), v("H02", "d3", "NV", { motivazione: "impianto fermo" })];
  const r = punt(voci, ["H01", "H02"]);
  ck("H02 = null", sezP(r, "H02").punteggio === null);
  ck("livello = 100", r.livelloComplessivo === 100);
  const rep = riepilogoHaccp(voci);
  ck("nvRilevanti true", rep.nvRilevanti === true);
  ck("noteNv = 2 con motivazioni", rep.noteNv.length === 2 && rep.noteNv[0].motivazione === "area chiusa");
}

console.log("\n[E] NV numerosi in mix");
{
  const voci = [v("H01", "d1", "C"), v("H01", "d2", "NV"), v("H01", "d3", "NV"), v("H01", "d4", "NC")];
  const r = punt(voci, ["H01"]);
  // valutabili: C, NC → (1+0)/2*100 = 50
  ck("H01 = 50 (NV esclusi dal denominatore)", sezP(r, "H01").punteggio === 50 && sezP(r, "H01").valutate === 2);
  const c = conteggiHaccp(voci);
  ck("conteggi C1 NV2 NC1", c.C === 1 && c.NV === 2 && c.NC === 1 && c.PC === 0 && c.NA === 0);
}

console.log("\n[F] nessuna valutabile → livello null, sezioni null");
{
  const r = punt([v("H01", "d1", "NA"), v("H02", "d2", "NV")], ["H01", "H02"]);
  ck("H01 null, H02 null", sezP(r, "H01").punteggio === null && sezP(r, "H02").punteggio === null);
  ck("livello null (nessuna sezione valutata)", r.livelloComplessivo === null);
}

console.log("\n[G] arrotondamento a 1 decimale");
{
  const r = punt([v("H01", "d1", "C"), v("H01", "d2", "C"), v("H01", "d3", "NC")], ["H01"]);
  ck("(1+1+0)/3*100 = 66.7", sezP(r, "H01").punteggio === 66.7);
}

console.log("\n[H] analizzaHaccp aggrega numeri + narrativa");
{
  const voci = [v("H01", "d1", "C"), v("H01", "d2", "NC", { osservazione: "manuale assente" })];
  const a = analizzaHaccp(voci, ["H01"]);
  ck("punteggio H01 = 50", sezP(a, "H01").punteggio === 50);
  ck("conteggi presenti", a.conteggi.C === 1 && a.conteggi.NC === 1);
  ck("rilievo NC con osservazione", a.rilievi.length === 1 && a.rilievi[0].osservazione === "manuale assente");
}

console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
