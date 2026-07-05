/**
 * Fase C2 — obblighi osservazione (Sprint HACCP 2). Unit test PURO sul motore
 * completa.ts: modello HACCP (rispostaCompletaHaccp/campoRichiestoHaccp) guidato
 * dalla mappa obbligo_osservazione del template canonico, + non-regressione del
 * modello sicurezza (rispostaCompleta).
 *
 * Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-fase-c2-obblighi.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  rispostaCompleta,
  rispostaCompletaHaccp,
  campoRichiestoHaccp,
} from "@/lib/checklist/completa";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const canon = JSON.parse(readFileSync(join(ROOT, "seed", "template-haccp-generico-v1.0.json"), "utf8"));
const OBB = canon.obbligo_osservazione; // {C:facoltativa,PC:obbligatoria,NC:obbligatoria,NV:motivazione_obbligatoria,NA:facoltativa}

let pass = 0, fail = 0;
function ck(n, ok, x = "") { console.log(`${ok ? "✓" : "✗"} ${n}${x ? "  — " + x : ""}`); if (ok) pass++; else fail++; }
const oss = (s) => ({ osservazioneEvidenza: s });
const mot = (s) => ({ motivazione: s });

console.log("Mappa obbligo_osservazione canonica:", JSON.stringify(OBB));

console.log("\n[campoRichiestoHaccp]");
ck("C → null (facoltativa)", campoRichiestoHaccp("C", OBB) === null);
ck("PC → osservazione_evidenza", campoRichiestoHaccp("PC", OBB) === "osservazione_evidenza");
ck("NC → osservazione_evidenza", campoRichiestoHaccp("NC", OBB) === "osservazione_evidenza");
ck("NV → motivazione", campoRichiestoHaccp("NV", OBB) === "motivazione");
ck("NA → null (facoltativa)", campoRichiestoHaccp("NA", OBB) === null);
ck("null → null", campoRichiestoHaccp(null, OBB) === null);

console.log("\n[rispostaCompletaHaccp]");
ck("null esito → incompleta", rispostaCompletaHaccp(null, {}, OBB) === false);
ck("C senza campi → completa (facoltativa)", rispostaCompletaHaccp("C", {}, OBB) === true);
ck("NA senza campi → completa (facoltativa)", rispostaCompletaHaccp("NA", {}, OBB) === true);
ck("PC senza osservazione → INCOMPLETA", rispostaCompletaHaccp("PC", {}, OBB) === false);
ck("PC con osservazione → completa", rispostaCompletaHaccp("PC", oss("rilievo"), OBB) === true);
ck("NC senza osservazione → INCOMPLETA", rispostaCompletaHaccp("NC", {}, OBB) === false);
ck("NC con osservazione → completa", rispostaCompletaHaccp("NC", oss("grave"), OBB) === true);
ck("NC con SOLO motivazione (campo sbagliato) → INCOMPLETA", rispostaCompletaHaccp("NC", mot("x"), OBB) === false);
ck("NV senza motivazione → INCOMPLETA", rispostaCompletaHaccp("NV", {}, OBB) === false);
ck("NV con motivazione → completa", rispostaCompletaHaccp("NV", mot("non accessibile"), OBB) === true);
ck("NV con SOLO osservazione (campo sbagliato) → INCOMPLETA", rispostaCompletaHaccp("NV", oss("x"), OBB) === false);
ck("osservazione di soli spazi non basta (PC)", rispostaCompletaHaccp("PC", oss("   "), OBB) === false);

console.log("\n[rispostaCompleta — sicurezza, NON deve cambiare]");
ck("sicurezza C → completa", rispostaCompleta("C", null, null) === true);
ck("sicurezza PC senza azione → incompleta", rispostaCompleta("PC", "", null) === false);
ck("sicurezza PC con azione → completa", rispostaCompleta("PC", "correzione", null) === true);
ck("sicurezza NC con azione → completa", rispostaCompleta("NC", "correzione", null) === true);
ck("sicurezza NV senza motivazione → incompleta", rispostaCompleta("NV", null, "") === false);
ck("sicurezza NA con motivazione → completa", rispostaCompleta("NA", null, "fuori scope") === true);

console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
