-- ============================================================
-- SafeCheck — Migration 012
-- Sprint 9.1: SEZ-08 multi-impresa (Art. 26 / DUVRI).
--
-- Sostituisce il modello v1 (8 domande uniche di sezione D-08-002..009 su
-- `risposte`) con un modello strutturato: N imprese inserite dal tecnico,
-- ciascuna con le proprie 8 risposte indipendenti.
--
-- DISCRIMINATORE v1 vs v1.1: il template_master attivo passa a versione 4 e
-- la sezione SEZ-08 acquisisce il marker `"multi_impresa": true`. Le nuove
-- visite ne salvano lo snapshot e usano il modello multi-impresa. Le visite
-- già create (snapshot a versione 3, senza marker) restano INVARIATE e
-- continuano a comportarsi come nello Sprint 9 (immutabilità snapshot).
--
-- NESSUNA migrazione del dato legacy: le righe `risposte` D-08-* esistenti
-- non vengono toccate, convertite né cancellate.
--
-- Convenzioni schema seguite (coerenti con migrazioni 001/007):
--   - `domanda_id` è TEXT (es. "D-08-002"): NON esiste una tabella `domande`,
--     le domande vivono nel template_snapshot JSONB (come per `risposte`).
--   - `esito` usa l'enum esistente `esito_risposta` (come `risposte.valore`).
--   - ownership RLS via `visite.specialist_id = auth.uid() OR is_admin()`.
--   - timestamp `aggiornato_il` (maschile) -> riuso di update_aggiornato_il().
-- ============================================================

-- ── Tabella imprese (anagrafica per visita) ───────────────────────────────
CREATE TABLE imprese_appalto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid NOT NULL REFERENCES visite(id) ON DELETE CASCADE,
  ragione_sociale text NOT NULL,
  tipo_impresa text NOT NULL
    CHECK (tipo_impresa IN ('appaltatrice', 'subappaltatrice', 'lavoratore_autonomo')),
  ordine integer NOT NULL DEFAULT 0,
  creato_il timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_imprese_appalto_visita ON imprese_appalto(visita_id);

-- ── Tabella risposte per impresa (8 domande D-08-002..009 per impresa) ─────
CREATE TABLE risposte_imprese_appalto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impresa_id uuid NOT NULL REFERENCES imprese_appalto(id) ON DELETE CASCADE,
  domanda_id text NOT NULL, -- es. "D-08-002" (id dal template_snapshot)
  esito esito_risposta NOT NULL,
  osservazione text,
  azione_correttiva text,
  creato_il timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  UNIQUE (impresa_id, domanda_id)
);

CREATE INDEX idx_risposte_imprese_impresa ON risposte_imprese_appalto(impresa_id);

-- ── Trigger timestamp (riuso funzione generica esistente, col. maschile) ───
CREATE TRIGGER trg_imprese_appalto_aggiornato
  BEFORE UPDATE ON imprese_appalto
  FOR EACH ROW EXECUTE FUNCTION update_aggiornato_il();

CREATE TRIGGER trg_risposte_imprese_aggiornato
  BEFORE UPDATE ON risposte_imprese_appalto
  FOR EACH ROW EXECUTE FUNCTION update_aggiornato_il();

-- ── RLS — stesso pattern di `risposte` (ownership via visita.specialist_id) ─
ALTER TABLE imprese_appalto ENABLE ROW LEVEL SECURITY;
ALTER TABLE risposte_imprese_appalto ENABLE ROW LEVEL SECURITY;

-- imprese_appalto: ownership diretta tramite visita_id
CREATE POLICY "imprese_appalto_all_via_visita" ON imprese_appalto
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = imprese_appalto.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = imprese_appalto.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

-- risposte_imprese_appalto: ownership a due hop (impresa -> visita)
CREATE POLICY "risposte_imprese_all_via_visita" ON risposte_imprese_appalto
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM imprese_appalto ia
      JOIN visite v ON v.id = ia.visita_id
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM imprese_appalto ia
      JOIN visite v ON v.id = ia.visita_id
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

-- ── Discriminatore template: versione 4 + marker multi_impresa su SEZ-08 ───
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
        WHEN s->>'id' = 'SEZ-08'
          THEN s || '{"multi_impresa": true}'::jsonb
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
    '{versione}', '4'::jsonb
  ),
  versione = 4
FROM new_sezioni ns
WHERE tm.id = ns.id;
