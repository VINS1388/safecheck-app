-- ============================================================
-- SafeCheck — Migration 010
-- Sprint 8 (FASE 2): nuovo campo "Osservazione / descrizione evidenza".
--
-- Campo testo OPZIONALE, distinto da:
--   - azione_correttiva (obbligatoria per PC/NC)
--   - osservazioni       (motivazione obbligatoria per NV/NA)
-- Visibile/compilabile solo per esiti PC e NC. Non concorre alla
-- validazione di completezza della domanda.
-- ============================================================

ALTER TABLE risposte
  ADD COLUMN IF NOT EXISTS osservazione_evidenza TEXT;
