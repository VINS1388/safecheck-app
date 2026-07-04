-- ============================================================
-- SafeCheck — Migration 024 (Sprint 16 · RBAC — parte 1/2)
-- Aggiunge il ruolo 'planner' all'enum ruolo_utente.
--
-- STANDALONE e da applicare PRIMA della migration 025 (helper + policy).
-- Motivo (vincolo Postgres): un valore aggiunto con ALTER TYPE ... ADD VALUE
-- NON è utilizzabile nella stessa transazione in cui viene aggiunto. La 025
-- referenzia 'planner' nelle policy/funzioni e viene testata in BEGIN…ROLLBACK:
-- perché quei test funzionino, 'planner' deve essere già committato nell'enum.
-- Quindi questa migration va applicata da sola (autocommit), non dentro una
-- transazione di test.
--
-- ADDITIVA e idempotente (ADD VALUE IF NOT EXISTS). Non tocca dati né policy:
-- nessun utente diventa planner qui — l'assegnazione avviene dall'area
-- /organizzazione (o via script) dopo che le policy 025 sono attive.
--
-- Ruoli risultanti: admin | specialist | planner. (viewer: fuori scope Sprint 16.)
-- ============================================================

ALTER TYPE public.ruolo_utente ADD VALUE IF NOT EXISTS 'planner';
