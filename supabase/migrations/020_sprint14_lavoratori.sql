-- ============================================================
-- SafeCheck — Migration 020
-- Sprint 14: formazione lavoratori per-nominativo.
--
-- Trasforma D-03-001 (SEZ-03) da domanda aggregata generica a domanda ITERATA
-- per lavoratore, derivata dall'elenco lavoratori di SEZ-01. L'esito C/PC/NC di
-- ogni lavoratore è calcolato automaticamente dalla data formazione + periodicità
-- (60 mesi) confrontata con la DATA DEL SOPRALLUOGO (Sprint 12.4). NA/NV non
-- previsti per i lavoratori: badge read-only, nessun override manuale.
--
-- Marker aggiunti al nodo D-03-001 (sostituzione IN PLACE, coerente con
-- l'immutabilità garantita dallo SNAPSHOT congelato su ogni visita — NON esiste
-- un flag `active` per singola domanda; le visite ≤ v8 restano sul loro snapshot):
--   - formazione_lavoratori: true   → derivata per lavoratore da SEZ-01
--   - calcolo_automatico: true
--   - periodicita_mesi: 60          → aggiornamento quinquennale (Accordo S-R)
--   - soglia_pc_giorni: 60          → uniforme al resto (Sprint 12.4)
--
-- Contenitore lavoratori (SEZ-01): NON è un nodo di struttura_json — segue lo
-- stesso pattern dei nominativi figure sicurezza (guidato da codice + riga
-- sintetica `risposte` con domanda_id='SEZ-01-LAV'). Nessuna modifica JSON in SEZ-01.
--
-- Campi anagrafici del lavoratore (nome, mansione, livello_rischio, data_formazione)
-- sono definiti lato codice (types), non nel template — come le figure sicurezza.
--
-- versione template_master: 8 → 9. Guard `versione = 8`: run-once (rieseguirla è
-- no-op). NESSUNA modifica a PDF/API in questa migration (solo template).
-- ============================================================

WITH t AS (
  SELECT id, struttura_json
  FROM template_master
  WHERE attivo = true AND versione = 8
),
new_sezioni AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN s->>'id' = 'SEZ-03' THEN
          jsonb_set(
            s,
            '{domande}',
            (
              SELECT jsonb_agg(
                CASE
                  WHEN d->>'id' = 'D-03-001' THEN
                    d || '{
                      "formazione_lavoratori": true,
                      "calcolo_automatico": true,
                      "periodicita_mesi": 60,
                      "soglia_pc_giorni": 60
                    }'::jsonb
                  ELSE d
                END
                ORDER BY (d->>'ordine')::numeric
              )
              FROM jsonb_array_elements(s->'domande') AS d
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
    '{versione}', '9'::jsonb
  ),
  versione = 9
FROM new_sezioni ns
WHERE tm.id = ns.id;
