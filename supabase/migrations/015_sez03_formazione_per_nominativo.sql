-- ============================================================
-- SafeCheck — Migration 015
-- Sprint 12: SEZ-03 formazione per-nominativo (vista derivata da SEZ-01).
--
-- Verifica schema (Step 0): i nominativi di SEZ-01 vivono come stringhe nude
-- in risposte.campo_extra (riga sintetica SEZ-01-NOMINATIVI), SENZA id stabile.
-- Decisione confermata: si introducono id stabili {id,nome} (modifica additiva
-- SEZ-01, gestita lato app/normalizer) e SEZ-03 deriva le domande dai nominativi.
--
-- Questa migration tocca SOLO il template_master (discriminatore), come per
-- SEZ-08 (Sprint 9.1): nessuna conversione retroattiva degli snapshot esistenti
-- (i 2 verbali chiusi con SEZ-03 legacy restano sul modello v4, immutabili).
--
-- Marker:
--   - sezione SEZ-03: "formazione_per_nominativo": true
--   - 8 domande mappate a una figura SEZ-01: "figura_nominativo": "<KEY>"
--       D-03-002→PREPOSTI  D-03-003→DIRIGENTI  D-03-004→DL  D-03-006→RSPP
--       D-03-007→ASPP  D-03-008→RLS  D-03-009→ANTINCENDIO  D-03-010→PRIMO_SOCCORSO
--   - D-03-001 (Lavoratori) e D-03-005 (DL-SPP) restano domande singole generiche.
-- versione template_master: 4 → 5.
-- ============================================================

WITH mappa(qid, fig) AS (
  VALUES
    ('D-03-002', 'PREPOSTI'),
    ('D-03-003', 'DIRIGENTI'),
    ('D-03-004', 'DL'),
    ('D-03-006', 'RSPP'),
    ('D-03-007', 'ASPP'),
    ('D-03-008', 'RLS'),
    ('D-03-009', 'ANTINCENDIO'),
    ('D-03-010', 'PRIMO_SOCCORSO')
),
t AS (
  SELECT id, struttura_json FROM template_master WHERE attivo = true
),
new_sezioni AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN s->>'id' = 'SEZ-03' THEN
          jsonb_set(
            s || '{"formazione_per_nominativo": true}'::jsonb,
            '{domande}',
            (
              SELECT jsonb_agg(
                CASE
                  WHEN m.fig IS NOT NULL
                  THEN d || jsonb_build_object('figura_nominativo', m.fig)
                  ELSE d
                END
                ORDER BY (d->>'ordine')::int
              )
              FROM jsonb_array_elements(s->'domande') AS d
              LEFT JOIN mappa m ON m.qid = d->>'id'
            )
          )
        ELSE s
      END
      ORDER BY (s->>'ordine')::int
    ) AS sezioni
  FROM t, jsonb_array_elements(t.struttura_json->'sezioni') AS s
  GROUP BY t.id
)
UPDATE template_master tm
SET
  struttura_json = jsonb_set(
    jsonb_set(tm.struttura_json, '{sezioni}', ns.sezioni),
    '{versione}', '5'::jsonb
  ),
  versione = 5
FROM new_sezioni ns
WHERE tm.id = ns.id;
