-- ============================================================
-- SafeCheck — Fix trigger timestamp su `visite`
-- ============================================================
-- BUG: la tabella `visite` usa la colonna `aggiornata_il` (femminile),
-- ma il trigger `trg_visite_aggiornato` invocava `update_aggiornato_il()`
-- che imposta `NEW.aggiornato_il` (maschile) — colonna inesistente su `visite`.
-- Effetto: OGNI UPDATE su `visite` falliva con
--   record "new" has no field "aggiornato_il"
-- emerso con la schermata "Avvia sopralluogo" (Sprint 7), primo flusso
-- applicativo che esegue un UPDATE su `visite`.
--
-- FIX: trigger dedicato che imposta la colonna corretta `aggiornata_il`.
-- I trigger su `utenti`/`clienti` restano invariati: quelle tabelle hanno
-- realmente la colonna `aggiornato_il` e continuano a usare update_aggiornato_il().
-- ============================================================

CREATE OR REPLACE FUNCTION update_aggiornata_il()
RETURNS TRIGGER AS $$
BEGIN
  NEW.aggiornata_il = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visite_aggiornato ON visite;

CREATE TRIGGER trg_visite_aggiornato
  BEFORE UPDATE ON visite
  FOR EACH ROW EXECUTE FUNCTION update_aggiornata_il();
