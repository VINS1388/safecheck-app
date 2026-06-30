-- ============================================================
-- SafeCheck — Migration 009
-- Micro-sprint DESCRIZIONE-DOMANDA: separa la descrizione normativa
-- (visibile in UI) dal note_tecnico (interno).
--
-- In Sprint 7-FIX la descrizione normativa delle domande nuove/riscritte
-- era stata mappata su `note_tecnico` (per assenza di un campo dedicato).
-- Qui la si sposta nel nuovo campo `descrizione` e si rimuove `note_tecnico`
-- da quelle domande.
--
-- Ambito: SOLO le domande di SEZ-01 e SEZ-06 che hanno `rif_normativo`
-- (esattamente le 8 introdotte/modificate nello Sprint 7-FIX). Le altre
-- domande mantengono il loro `note_tecnico` invariato.
--
-- IMMUTABILITÀ: si aggiorna SOLO template_master (fonte per nuove visite).
-- Gli snapshot delle visite già create restano congelati e non vengono toccati.
-- ============================================================

WITH t AS (
  SELECT id, struttura_json
  FROM template_master
  WHERE attivo = true
),
new_sezioni AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN s->>'id' IN ('SEZ-01', 'SEZ-06') THEN
          jsonb_set(
            s,
            '{domande}',
            (
              SELECT jsonb_agg(
                CASE
                  WHEN (d ? 'rif_normativo')
                       AND (d ? 'note_tecnico')
                       AND length(trim(d->>'note_tecnico')) > 0
                  THEN (d - 'note_tecnico')
                       || jsonb_build_object('descrizione', d->'note_tecnico')
                  ELSE d
                END
                ORDER BY (d->>'ordine')::int
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
SET struttura_json = jsonb_set(tm.struttura_json, '{sezioni}', ns.sezioni)
FROM new_sezioni ns
WHERE tm.id = ns.id;
