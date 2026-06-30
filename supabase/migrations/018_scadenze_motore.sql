-- ============================================================
-- SafeCheck — Migration 018
-- Sprint 12.3: motore Scadenze generico (data + periodicità).
--
-- Tabella polimorfica `scadenze`, riusabile da:
--   - Sprint 12.3: formazione SEZ-03 / sorveglianza MC (quando Vincenzo
--     configurerà le periodicità per-domanda — NON in questo sprint).
--   - Sprint 13: NC tracking (scadenze MANUALI, periodicita_mesi = NULL).
--   - Sprint 14: visite pianificate.
--
-- Questo sprint costruisce SOLO lo schema + la funzione di calcolo + una vista
-- read-only. NESSUNA automazione email/cron. NESSUNA modifica a PDF o template
-- (versione resta 7: differito finché non esistono valori di periodicità da
-- configurare — additivo e indipendente dal template, come da piano).
--
-- Calcolo: funzione SQL pura `calcola_scadenza(data, mesi)` (orchestrata a
-- livello applicativo, nessun trigger su `risposte`). Le scadenze manuali
-- accettano INSERT diretto con periodicita_mesi = NULL e data_scadenza a mano.
-- ============================================================

-- ── Tabella ─────────────────────────────────────────────────────────────────
CREATE TABLE scadenze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo varchar NOT NULL CHECK (tipo IN ('formazione','certificazione','azione_correttiva','visita_pianificata','altro')),
  cliente_id uuid REFERENCES clienti(id),
  sede_id uuid REFERENCES sedi(id),
  riferimento_tipo varchar NOT NULL,        -- es. 'risposta_checklist', 'nc', 'visita'
  riferimento_id uuid NOT NULL,             -- es. risposte.id (uuid)
  data_riferimento date,
  periodicita_mesi int,                     -- NULL = scadenza manuale (non calcolata)
  data_scadenza date NOT NULL,
  stato varchar NOT NULL DEFAULT 'attiva' CHECK (stato IN ('attiva','risolta','scaduta','annullata')),
  note text,
  creato_il timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scadenze_stato_data ON scadenze(stato, data_scadenza);
CREATE INDEX idx_scadenze_riferimento ON scadenze(riferimento_tipo, riferimento_id);
CREATE INDEX idx_scadenze_cliente ON scadenze(cliente_id);

-- ── Trigger updated-at (riusa la funzione esistente, colonna aggiornato_il) ──
CREATE TRIGGER trg_scadenze_aggiornato
  BEFORE UPDATE ON scadenze
  FOR EACH ROW EXECUTE FUNCTION update_aggiornato_il();

-- ── RLS — single-tenant, stesso pattern di clienti/sedi ─────────────────────
ALTER TABLE scadenze ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scadenze_select_authenticated" ON scadenze
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "scadenze_insert_authenticated" ON scadenze
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "scadenze_update_authenticated" ON scadenze
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "scadenze_delete_admin" ON scadenze
  FOR DELETE USING (is_admin());

-- ── Funzione di calcolo (pura, IMMUTABLE) ───────────────────────────────────
-- data_riferimento + periodicita_mesi mesi → date. Postgres normalizza gli
-- overflow di fine mese (es. 2025-01-31 + 1 mese = 2025-02-28). Ritorna NULL
-- se uno dei due input è NULL (scadenza manuale: data_scadenza impostata a mano).
CREATE OR REPLACE FUNCTION calcola_scadenza(data_riferimento date, periodicita_mesi int)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN data_riferimento IS NULL OR periodicita_mesi IS NULL THEN NULL
    ELSE (data_riferimento + (periodicita_mesi || ' months')::interval)::date
  END;
$$;
