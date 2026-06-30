-- ============================================================
-- SafeCheck — Migration 017
-- Fix Sprint 12.1: la domanda "nomina del Medico Competente" entra come PRIMA
-- domanda del blocco condizionale "Sorveglianza sanitaria" in SEZ-01.
--
-- NOTA SCHEMA: il template è memorizzato come JSON in template_master.struttura_json
-- (colonne reali: id, attivo, versione, struttura_json). NON esistono colonne
-- relazionali codice/sezione/ordine/gated_by né una tabella `domande`. Questa
-- migration opera quindi sul JSON, coerente con la 016.
--
-- Stato pre-migration (verificato, template attivo v6):
--   D-01-012 [ord 4]   filtro (gate)
--   D-01-014 [ord 4.1] gated_by=D-01-012
--   D-01-015 [ord 4.2] gated_by=D-01-012
--   D-01-016 [ord 4.3] gated_by=D-01-012
--   D-01-002 [ord 5]   "atto di nomina del Medico Competente" — NON gated
--
-- Operazione (additiva, solo UPDATE sul JSON, nessun INSERT/DELETE di domande):
--   - D-01-002 → gated_by='D-01-012', gate_collassa_su=["NA","NV"], ordine 4.1
--     (prima del blocco; collassa con la stessa regola NA/NV delle altre)
--   - D-01-014 → 4.2, D-01-015 → 4.3, D-01-016 → 4.4 (shift per fare spazio)
--   Ordini frazionari 4.x: il blocco resta contiguo sotto la filtro (ord 4) e
--   prima della domanda successiva (D-01-006, ord 6). Lo slot intero 5 resta
--   libero — irrilevante, l'app ordina sempre per `ordine` a runtime.
--
-- versione template_master: 6 → 7. Solo template: gli snapshot legacy (≤ v6)
-- sono immutabili → visite esistenti non impattate, nessuna conversione.
-- Guard `versione = 6`: la migration è run-once (rieseguirla è no-op).
-- NESSUNA modifica a PDF, API, Prisma.
-- ============================================================

WITH t AS (
  SELECT id, struttura_json
  FROM template_master
  WHERE attivo = true AND versione = 6
),
new_sezioni AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN s->>'id' = 'SEZ-01' THEN
          jsonb_set(
            s,
            '{domande}',
            (
              SELECT jsonb_agg(
                CASE d->>'id'
                  WHEN 'D-01-002' THEN
                    d || '{"gated_by": "D-01-012", "gate_collassa_su": ["NA","NV"], "ordine": 4.1}'::jsonb
                  WHEN 'D-01-014' THEN jsonb_set(d, '{ordine}', '4.2'::jsonb)
                  WHEN 'D-01-015' THEN jsonb_set(d, '{ordine}', '4.3'::jsonb)
                  WHEN 'D-01-016' THEN jsonb_set(d, '{ordine}', '4.4'::jsonb)
                  ELSE d
                END
                ORDER BY (
                  CASE d->>'id'
                    WHEN 'D-01-002' THEN 4.1
                    WHEN 'D-01-014' THEN 4.2
                    WHEN 'D-01-015' THEN 4.3
                    WHEN 'D-01-016' THEN 4.4
                    ELSE (d->>'ordine')::numeric
                  END
                )
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
    '{versione}', '7'::jsonb
  ),
  versione = 7
FROM new_sezioni ns
WHERE tm.id = ns.id;
