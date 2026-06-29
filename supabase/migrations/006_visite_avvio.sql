-- ============================================================
-- SafeCheck — Campi schermata "Avvia sopralluogo" (Sprint 7)
-- referente_cliente e ora_inizio esistono già nello schema:
-- qui aggiungiamo qualifica_tecnico e note_preliminari.
-- ============================================================

ALTER TABLE visite
  ADD COLUMN IF NOT EXISTS qualifica_tecnico TEXT,
  ADD COLUMN IF NOT EXISTS note_preliminari TEXT;
