-- ============================================================
-- SafeCheck — Migration 019
-- Sprint 12.4: calcolo automatico C/PC/NC da scadenza attestati.
--
-- Collega il campo data attestato/verifica (già esistente per le domande di
-- formazione SEZ-03 per-nominativo, Sprint 12) al motore scadenze (Sprint 12.3):
-- da (data attestato, periodicità normativa) e dalla DATA DEL SOPRALLUOGO si
-- deriva l'esito C/PC/NC. La logica di calcolo vive lato applicativo
-- (valutaConformitaDaScadenza), qui si aggiungono solo i flag per-domanda al
-- template. NA/NV restano sempre scelta manuale del tecnico.
--
-- Flag aggiunti ai nodi domanda interessati (struttura_json):
--   - calcolo_automatico: true
--   - periodicita_mesi:   <valore normativo per-domanda>
--   - soglia_pc_giorni:   60 (uniforme)
--   - campo_data:         true SOLO dove non già presente (D-03-005, D-01-008;
--                         D-01-016 lo ha già da migration 016; le 8 domande
--                         per-nominativo SEZ-03 mostrano il campo data via UI).
--
-- Periodicità (mesi), confermate da Vincenzo — nessun valore inventato:
--   D-03-002 Preposti 24 · D-03-003 Dirigenti 60 · D-03-004 DL 60 ·
--   D-03-005 DL-SPP 60 · D-03-006 RSPP 60 · D-03-007 ASPP 60 · D-03-008 RLS 12 ·
--   D-03-009 Antincendio 60 · D-03-010 Primo Soccorso 36 ·
--   D-01-008 Riunione periodica 12 · D-01-016 Sopralluogo annuale MC 12.
--
-- FUORI SCOPE (non toccate): D-03-001 (Formazione lavoratori, resta manuale →
-- Sprint 12.5) e la "prova evacuazione" SEZ-04 (non ancora esistente).
--
-- versione template_master: 7 → 8. Solo template: gli snapshot legacy (≤ v7)
-- non contengono questi flag → nessun calcolo su verbali esistenti, nessuna
-- conversione retroattiva. Guard `versione = 7`: run-once (rieseguirla è no-op).
-- NESSUNA modifica a PDF, API, Prisma.
-- ============================================================

WITH patch(qid, mesi, add_data) AS (
  VALUES
    ('D-03-002', 24, false),
    ('D-03-003', 60, false),
    ('D-03-004', 60, false),
    ('D-03-005', 60, true),   -- DL-SPP: reso come DomandaCard semplice, serve campo_data
    ('D-03-006', 60, false),
    ('D-03-007', 60, false),
    ('D-03-008', 12, false),
    ('D-03-009', 60, false),
    ('D-03-010', 36, false),
    ('D-01-008', 12, true),   -- Riunione periodica: nuovo campo_data
    ('D-01-016', 12, false)   -- Sopralluogo MC: campo_data già presente (mig. 016)
),
t AS (
  SELECT id, struttura_json
  FROM template_master
  WHERE attivo = true AND versione = 7
),
new_sezioni AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN s->>'id' IN ('SEZ-01', 'SEZ-03') THEN
          jsonb_set(
            s,
            '{domande}',
            (
              SELECT jsonb_agg(
                CASE
                  WHEN p.qid IS NOT NULL THEN
                    d
                    || jsonb_build_object(
                         'calcolo_automatico', true,
                         'periodicita_mesi', p.mesi,
                         'soglia_pc_giorni', 60
                       )
                    || (CASE WHEN p.add_data THEN '{"campo_data": true}'::jsonb ELSE '{}'::jsonb END)
                  ELSE d
                END
                ORDER BY (d->>'ordine')::numeric
              )
              FROM jsonb_array_elements(s->'domande') AS d
              LEFT JOIN patch p ON p.qid = d->>'id'
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
    '{versione}', '8'::jsonb
  ),
  versione = 8
FROM new_sezioni ns
WHERE tm.id = ns.id;
