// Test Sprint 12.4 — calcolo automatico C/PC/NC da scadenza attestati.
// Logica pura in-memory (valutaConformitaDaScadenza, differenzaGiorni,
// calcolaEsitoAuto, etichettaAuto) + verifica flag template su DB con la
// migration 019 applicata in transazione NON persistente (BEGIN…ROLLBACK).
//
// Uso: node --experimental-strip-types --experimental-loader ./scripts/alias-hook.mjs scripts/test-sprint12-4.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import {
  valutaConformitaDaScadenza,
  differenzaGiorni,
  calcolaScadenza,
} from "@/lib/scadenze/calcola";
import { calcolaEsitoAuto, etichettaAuto } from "@/lib/scadenze/autocalcolo";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "yrgpowaflmcwwspffjip";
const SQL_FILE = join(ROOT, "supabase", "migrations", "019_calcolo_automatico_scadenze.sql");

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

// Data del sopralluogo usata nei test — DIVERSA dalla data di sistema (oggi),
// così i test dimostrano che il calcolo usa la data sopralluogo, non `now()`.
const SOPRALLUOGO = "2026-07-01";

// ── SCENARIO A — esito NC / PC / C ─────────────────────────────────────────
console.log("── SCENARIO A — valutaConformitaDaScadenza (NC/PC/C) ──");
// NC: Preposti (24m), attestato 2023-01-01 → scadenza 2025-01-01 < sopralluogo.
check(
  "NC — attestato oltre periodicità (24m, scaduto)",
  valutaConformitaDaScadenza("2023-01-01", 24, SOPRALLUOGO) === "NC",
  `scadenza=${calcolaScadenza("2023-01-01", 24)}`
);
// PC: 60m, scadenza entro 60 giorni DOPO il sopralluogo.
//   attestato 2021-08-01 → scadenza 2026-08-01, a 31 giorni dal sopralluogo.
check(
  "PC — scadenza entro soglia 60gg dal sopralluogo",
  valutaConformitaDaScadenza("2021-08-01", 60, SOPRALLUOGO) === "PC",
  `scadenza=${calcolaScadenza("2021-08-01", 60)} (${differenzaGiorni("2026-08-01", SOPRALLUOGO)}gg)`
);
// C: 60m, attestato recente → scadenza ben oltre soglia.
check(
  "C — attestato ben dentro periodicità",
  valutaConformitaDaScadenza("2026-01-01", 60, SOPRALLUOGO) === "C",
  `scadenza=${calcolaScadenza("2026-01-01", 60)}`
);
// Confine soglia: scadenza esattamente a 60gg = PC; a 61gg = C.
check("confine PC — 60gg esatti = PC", valutaConformitaDaScadenza(
  calcolaScadenza("2026-08-30", -60), 60, SOPRALLUOGO) === "PC", "scad 2026-08-30 = 60gg");
check("confine C — 61gg = C", valutaConformitaDaScadenza(
  calcolaScadenza("2026-08-31", -60), 60, SOPRALLUOGO) === "C", "scad 2026-08-31 = 61gg");
// Confine scaduto: scadenza = giorno del sopralluogo → 0gg = PC (non ancora scaduto).
check("confine NC/PC — scadenza = giorno sopralluogo → PC (0gg)",
  valutaConformitaDaScadenza("2021-07-01", 60, SOPRALLUOGO) === "PC");
check("confine NC — scadenza = giorno prima → NC",
  valutaConformitaDaScadenza("2021-06-30", 60, SOPRALLUOGO) === "NC");

// ── SCENARIO B — usa la DATA DEL SOPRALLUOGO, non la data di sistema ────────
console.log("\n── SCENARIO B — riferimento = data sopralluogo, non oggi ──");
// Stesso attestato + periodicità (scadenza 2026-06-01), tre sopralluoghi diversi
// → tre esiti diversi, indipendenti dalla data odierna.
const attB = "2021-06-01"; // 60m → scadenza 2026-06-01
check("scadenza calcolata = 2026-06-01", calcolaScadenza(attB, 60) === "2026-06-01");
check("sopralluogo 2024-01-01 (molto prima) → C",
  valutaConformitaDaScadenza(attB, 60, "2024-01-01") === "C");
check("sopralluogo 2026-05-01 (entro 60gg) → PC",
  valutaConformitaDaScadenza(attB, 60, "2026-05-01") === "PC");
check("sopralluogo 2026-07-01 (dopo scadenza) → NC",
  valutaConformitaDaScadenza(attB, 60, "2026-07-01") === "NC");
// Prova esplicita: stesso input, la data sopralluogo cambia l'esito.
check("stesso attestato, esiti diversi per sopralluogo diverso (riproducibile)",
  valutaConformitaDaScadenza(attB, 60, "2024-01-01") !==
  valutaConformitaDaScadenza(attB, 60, "2026-07-01"));

// ── SCENARIO C — NA/NV restano manuali, mai calcolati ───────────────────────
console.log("\n── SCENARIO C — NA/NV sempre manuali ──");
// La funzione di calcolo non emette MAI NA/NV.
const esitiPossibili = new Set();
for (const [d, m] of [["2020-01-01", 24], ["2026-01-01", 60], ["2021-08-01", 60]])
  esitiPossibili.add(valutaConformitaDaScadenza(d, m, SOPRALLUOGO));
check("il calcolo emette solo C/PC/NC (mai NA/NV)",
  ![...esitiPossibili].some((e) => e === "NA" || e === "NV"),
  [...esitiPossibili].join(","));
// etichettaAuto: se il tecnico ha scelto NA/NV, l'etichetta NON propone un calcolo.
check("etichetta con NA manuale → nota 'impostato manualmente' (nessun calcolo)",
  /manualmente/i.test(etichettaAuto("NA", "2020-01-01", 24, SOPRALLUOGO)));
check("etichetta con NV manuale → nota 'impostato manualmente'",
  /manualmente/i.test(etichettaAuto("NV", "2026-01-01", 60, SOPRALLUOGO)));
// Senza data e senza NA/NV → invito a inserire la data.
check("etichetta senza data → invito a inserire la data",
  /inserisci la data/i.test(etichettaAuto(null, "", 60, SOPRALLUOGO)));
// Con data e senza scelta manuale → etichetta del calcolato.
check("etichetta con data → 'Calcolato:'",
  /^Calcolato:/.test(etichettaAuto(null, "2023-01-01", 24, SOPRALLUOGO)));

// ── SCENARIO D — periodicità letta per-domanda (24/36/60), non hardcoded ────
console.log("\n── SCENARIO D — periodicità per-domanda (24/36/60) ──");
const att = "2024-01-10"; // attestato comune
check("24m (Preposti): scadenza 2026-01-10", calcolaScadenza(att, 24) === "2026-01-10");
check("36m (Primo Soccorso): scadenza 2027-01-10", calcolaScadenza(att, 36) === "2027-01-10");
check("60m (RSPP/DL/…): scadenza 2029-01-10", calcolaScadenza(att, 60) === "2029-01-10");
// Stesso attestato, stesso sopralluogo → esiti diversi per periodicità diversa.
check("24m → NC (scaduto al 2026-07-01)", valutaConformitaDaScadenza(att, 24, SOPRALLUOGO) === "NC");
check("36m → C (valido oltre soglia)", valutaConformitaDaScadenza(att, 36, SOPRALLUOGO) === "C");
check("60m → C", valutaConformitaDaScadenza(att, 60, SOPRALLUOGO) === "C");
check("12m (RLS/riunione/MC) → NC", valutaConformitaDaScadenza(att, 12, SOPRALLUOGO) === "NC");

// ── SCENARIO E — differenzaGiorni ───────────────────────────────────────────
console.log("\n── SCENARIO E — differenzaGiorni (UTC, no drift fuso) ──");
check("stesso giorno = 0", differenzaGiorni("2026-07-01", "2026-07-01") === 0);
check("un giorno dopo = 1", differenzaGiorni("2026-07-02", "2026-07-01") === 1);
check("un giorno prima = -1", differenzaGiorni("2026-06-30", "2026-07-01") === -1);
check("attraverso il cambio anno", differenzaGiorni("2027-01-01", "2026-12-31") === 1);
check("intervallo lungo (365 giorni, 2025 non bisestile)",
  differenzaGiorni("2026-01-01", "2025-01-01") === 365);
// calcolaEsitoAuto: null se manca la data.
check("calcolaEsitoAuto(null) → null", calcolaEsitoAuto("", 60, SOPRALLUOGO) === null);
check("calcolaEsitoAuto valido → oggetto con esito+scadenza+etichetta", (() => {
  const r = calcolaEsitoAuto("2023-01-01", 24, SOPRALLUOGO);
  return r && r.esito === "NC" && r.scadenza === "2025-01-01" && /Calcolato: NC/.test(r.etichetta);
})());

// ── SCENARIO F — flag template dopo migration 019 (BEGIN…ROLLBACK) ──────────
console.log("\n── SCENARIO F — migration 019: flag template (rollback) ──");
await c.connect();
try {
  await c.query("BEGIN");
  // Applica la migration nella transazione (no-op se già a v8).
  await c.query(readFileSync(SQL_FILE, "utf8"));

  const flag = async (id) => {
    const { rows } = await c.query(
      `SELECT d->>'calcolo_automatico' ca, d->>'periodicita_mesi' pm,
              d->>'soglia_pc_giorni' spc, d->>'campo_data' cd
       FROM template_master tm,
            jsonb_array_elements(tm.struttura_json->'sezioni') s,
            jsonb_array_elements(s->'domande') d
       WHERE tm.attivo = true AND d->>'id' = $1`,
      [id]
    );
    return rows[0] ?? {};
  };

  const preposti = await flag("D-03-002");
  check("D-03-002 Preposti: calcolo_automatico + periodicita 24 + soglia 60",
    preposti.ca === "true" && preposti.pm === "24" && preposti.spc === "60");
  const ps = await flag("D-03-010");
  check("D-03-010 Primo Soccorso: periodicita 36", ps.ca === "true" && ps.pm === "36");
  const rls = await flag("D-03-008");
  check("D-03-008 RLS: periodicita 12", rls.ca === "true" && rls.pm === "12");
  const dlspp = await flag("D-03-005");
  check("D-03-005 DL-SPP: periodicita 60 + campo_data aggiunto",
    dlspp.ca === "true" && dlspp.pm === "60" && dlspp.cd === "true");
  const riunione = await flag("D-01-008");
  check("D-01-008 Riunione periodica: periodicita 12 + campo_data aggiunto",
    riunione.ca === "true" && riunione.pm === "12" && riunione.cd === "true");
  const mc = await flag("D-01-016");
  check("D-01-016 Sopralluogo MC: periodicita 12 + campo_data preservato",
    mc.ca === "true" && mc.pm === "12" && mc.cd === "true");
  // Fuori scope: D-03-001 (Formazione lavoratori) NON deve essere flaggata.
  const lav = await flag("D-03-001");
  check("D-03-001 Lavoratori: NON flaggata (fuori scope, Sprint 12.5)",
    lav.ca == null && lav.pm == null);

  const { rows: v } = await c.query(
    `SELECT versione, struttura_json->>'versione' AS jv FROM template_master WHERE attivo = true`
  );
  check("template versione 8 (int + json)", v[0].versione === 8 && v[0].jv === "8");

  await c.query("ROLLBACK");
} finally {
  await c.end();
}

console.log(fail ? "\n✗ TEST FALLITO" : "\n✓ TUTTI GLI SCENARI OK");
process.exit(fail ? 1 : 0);
