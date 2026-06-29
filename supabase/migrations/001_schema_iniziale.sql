-- ============================================================
-- SafeCheck — Schema iniziale MVP
-- ============================================================

-- Enum per stato visita
CREATE TYPE stato_visita AS ENUM (
  'pianificata',
  'in_corso',
  'bozza',
  'completata',
  'verbale_generato'
);

-- Enum per stato verbale
CREATE TYPE stato_verbale AS ENUM (
  'bozza',
  'chiuso',
  'sostituito'
);

-- Enum per esito risposta
CREATE TYPE esito_risposta AS ENUM (
  'C', 'PC', 'NC', 'NV', 'NA'
);

-- Enum per ruolo utente
CREATE TYPE ruolo_utente AS ENUM (
  'admin',
  'specialist'
);

-- ============================================================
-- UTENTI (estende auth.users di Supabase)
-- ============================================================
CREATE TABLE utenti (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  nome_completo TEXT NOT NULL,
  ruolo ruolo_utente NOT NULL DEFAULT 'specialist',
  telefono TEXT,
  qualifica TEXT,
  attivo BOOLEAN NOT NULL DEFAULT true,
  creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLIENTI
-- ============================================================
CREATE TABLE clienti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ragione_sociale TEXT NOT NULL,
  partita_iva TEXT,
  codice_fiscale TEXT,
  indirizzo_sede_legale TEXT,
  citta TEXT,
  cap TEXT,
  provincia TEXT,
  referente_principale TEXT,
  telefono_referente TEXT,
  email_referente TEXT,
  note TEXT,
  attivo BOOLEAN NOT NULL DEFAULT true,
  creato_da UUID REFERENCES utenti(id),
  creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SEDI
-- ============================================================
CREATE TABLE sedi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  indirizzo TEXT NOT NULL,
  citta TEXT NOT NULL,
  cap TEXT,
  provincia TEXT,
  referente_sede TEXT,
  telefono_referente TEXT,
  note TEXT,
  attiva BOOLEAN NOT NULL DEFAULT true,
  creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TEMPLATE SISTEMA (3 livelli)
-- ============================================================

-- Livello 1: template master SafeCheck (solo admin sistema)
CREATE TABLE template_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descrizione TEXT,
  versione INTEGER NOT NULL DEFAULT 1,
  struttura_json JSONB NOT NULL,
  attivo BOOLEAN NOT NULL DEFAULT true,
  creato_da UUID REFERENCES utenti(id),
  creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(versione)
);

-- Livello 2: template per cliente (fork del master)
CREATE TABLE template_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  basato_su UUID REFERENCES template_master(id),
  versione INTEGER NOT NULL DEFAULT 1,
  struttura_json JSONB NOT NULL,
  modificato_da UUID REFERENCES utenti(id),
  modificato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Livello 3: override per sede (opzionale)
CREATE TABLE template_sede (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedi(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clienti(id),
  basato_su UUID REFERENCES template_cliente(id),
  versione INTEGER NOT NULL DEFAULT 1,
  struttura_json JSONB NOT NULL,
  modificato_da UUID REFERENCES utenti(id),
  modificato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creato_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Log modifiche template
CREATE TABLE template_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type TEXT NOT NULL CHECK (template_type IN ('master','cliente','sede')),
  template_id UUID NOT NULL,
  utente_id UUID REFERENCES utenti(id),
  azione TEXT NOT NULL,
  dettagli_json JSONB,
  eseguita_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- VISITE
-- ============================================================
CREATE TABLE visite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedi(id),
  cliente_id UUID NOT NULL REFERENCES clienti(id),
  specialist_id UUID NOT NULL REFERENCES utenti(id),

  -- Template usato (risolto al momento della creazione)
  template_master_id UUID REFERENCES template_master(id),
  template_cliente_id UUID REFERENCES template_cliente(id),
  template_sede_id UUID REFERENCES template_sede(id),
  template_snapshot JSONB NOT NULL, -- copia immutabile al momento della visita

  -- Metadati visita
  numero_verbale TEXT UNIQUE, -- formato VRB-YYYY-NNN, assegnato alla chiusura
  data_visita DATE NOT NULL,
  ora_inizio TIME,
  referente_cliente TEXT,
  note_modifiche TEXT, -- modifiche significative dall'ultima visita
  note_conclusive TEXT,

  -- Stato
  stato stato_visita NOT NULL DEFAULT 'pianificata',
  stato_verbale stato_verbale,

  -- Genealogia verbali
  derivato_da UUID REFERENCES visite(id),
  sostituisce UUID REFERENCES visite(id),
  sostituito_da UUID REFERENCES visite(id),

  -- Timestamp
  creata_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  avviata_il TIMESTAMPTZ,
  completata_il TIMESTAMPTZ,
  verbale_generato_il TIMESTAMPTZ,
  aggiornata_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RISPOSTE
-- ============================================================
CREATE TABLE risposte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id UUID NOT NULL REFERENCES visite(id) ON DELETE CASCADE,
  domanda_id TEXT NOT NULL, -- es. "D-01-001" (dall'id nel template_snapshot)
  sezione_id TEXT NOT NULL, -- es. "SEZ-01"

  -- Risposta
  valore esito_risposta,
  osservazioni TEXT,
  azione_correttiva TEXT,

  -- Campi extra (nominativi per SEZ-01)
  campo_extra JSONB,
  -- singolo: {"nominativo": "Mario Rossi"}
  -- multiplo: {"nominativi": ["Mario Rossi", "Luigi Bianchi"]}

  -- Timestamp
  salvata_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aggiornata_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(visita_id, domanda_id)
);

-- ============================================================
-- PUNTEGGI PER SEZIONE (materializzati)
-- ============================================================
CREATE TABLE punteggi_sezione (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id UUID NOT NULL REFERENCES visite(id) ON DELETE CASCADE,
  sezione_id TEXT NOT NULL,
  n_conformi INTEGER NOT NULL DEFAULT 0,
  n_parz_conformi INTEGER NOT NULL DEFAULT 0,
  n_non_conformi INTEGER NOT NULL DEFAULT 0,
  n_non_verificati INTEGER NOT NULL DEFAULT 0,
  n_non_applicabili INTEGER NOT NULL DEFAULT 0,
  calcolato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(visita_id, sezione_id)
);

-- ============================================================
-- VERBALI PDF
-- ============================================================
CREATE TABLE verbali_pdf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id UUID NOT NULL REFERENCES visite(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL, -- path nel bucket Supabase Storage
  sha256_hash TEXT NOT NULL,  -- integrità file
  numero_versione INTEGER NOT NULL DEFAULT 1,
  dimensione_bytes INTEGER,
  generato_il TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generato_da UUID REFERENCES utenti(id),

  UNIQUE(visita_id, numero_versione)
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id UUID REFERENCES visite(id),
  utente_id UUID REFERENCES utenti(id),
  azione TEXT NOT NULL,
  dettagli JSONB,
  ip_address TEXT,
  eseguita_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDICI
-- ============================================================
CREATE INDEX idx_sedi_cliente ON sedi(cliente_id);
CREATE INDEX idx_visite_sede ON visite(sede_id);
CREATE INDEX idx_visite_cliente ON visite(cliente_id);
CREATE INDEX idx_visite_specialist ON visite(specialist_id);
CREATE INDEX idx_visite_stato ON visite(stato);
CREATE INDEX idx_visite_data ON visite(data_visita DESC);
CREATE INDEX idx_risposte_visita ON risposte(visita_id);
CREATE INDEX idx_risposte_domanda ON risposte(domanda_id);
CREATE INDEX idx_punteggi_visita ON punteggi_sezione(visita_id);
CREATE INDEX idx_verbali_visita ON verbali_pdf(visita_id);
CREATE INDEX idx_audit_visita ON audit_log(visita_id);
CREATE INDEX idx_template_cliente_cliente ON template_cliente(cliente_id);
CREATE INDEX idx_template_sede_sede ON template_sede(sede_id);

-- ============================================================
-- FUNZIONE aggiornamento timestamp automatico
-- ============================================================
CREATE OR REPLACE FUNCTION update_aggiornato_il()
RETURNS TRIGGER AS $$
BEGIN
  NEW.aggiornato_il = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_utenti_aggiornato
  BEFORE UPDATE ON utenti
  FOR EACH ROW EXECUTE FUNCTION update_aggiornato_il();

CREATE TRIGGER trg_clienti_aggiornato
  BEFORE UPDATE ON clienti
  FOR EACH ROW EXECUTE FUNCTION update_aggiornato_il();

CREATE TRIGGER trg_visite_aggiornato
  BEFORE UPDATE ON visite
  FOR EACH ROW EXECUTE FUNCTION update_aggiornato_il();

-- ============================================================
-- FUNZIONE numerazione verbale progressiva
-- ============================================================
CREATE OR REPLACE FUNCTION assegna_numero_verbale(
  p_visita_id UUID,
  p_anno INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TEXT AS $$
DECLARE
  v_numero INTEGER;
  v_stringa TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero_verbale, '-', 3) AS INTEGER)
  ), 0) + 1
  INTO v_numero
  FROM visite
  WHERE numero_verbale LIKE 'VRB-' || p_anno || '-%'
    AND numero_verbale IS NOT NULL;

  v_stringa := 'VRB-' || p_anno || '-' || LPAD(v_numero::TEXT, 3, '0');

  UPDATE visite SET numero_verbale = v_stringa WHERE id = p_visita_id;

  RETURN v_stringa;
END;
$$ LANGUAGE plpgsql;
