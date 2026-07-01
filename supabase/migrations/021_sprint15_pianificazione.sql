-- ============================================================
-- SafeCheck — Migration 021
-- Sprint 15: pianificazione visite per sede.
--
-- Ogni sede può avere un piano contrattuale (N visite/anno da una data di inizio
-- ciclo). Il sistema genera slot con date suggerite distribuite uniformemente sul
-- ciclo (intervallo = 12/N mesi, riusa calcola_scadenza() di Sprint 12.3 per
-- l'aritmetica dei mesi). Gli slot vengono agganciati alla visita reale alla
-- chiusura del verbale (side-effect best-effort).
--
-- Tabelle DEDICATE (non il motore scadenze di Sprint 12.3): qui la semantica è
-- "N slot distribuiti su un ciclo + stati + aggancio a visita + ciclo_numero",
-- non "una scadenza da periodicità fissa".
--
-- Single-tenant: RLS = stesso pattern di scadenze/sedi (auth.uid() IS NOT NULL
-- per SELECT/INSERT/UPDATE, is_admin() per DELETE). Nessun multi-tenancy.
-- Naming timestamp: creato_il/aggiornato_il (convenzione progetto) + trigger
-- update_aggiornato_il riusato.
-- ============================================================

-- ── Enum stato slot ─────────────────────────────────────────────────────────
CREATE TYPE stato_slot_pianificato AS ENUM ('da_pianificare', 'pianificata', 'eseguita');

-- ── Tabella piani_visite (1 per sede) ───────────────────────────────────────
CREATE TABLE piani_visite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id uuid NOT NULL UNIQUE REFERENCES sedi(id) ON DELETE CASCADE,
  data_inizio_ciclo date NOT NULL,
  visite_anno int NOT NULL CHECK (visite_anno >= 1 AND visite_anno <= 12),
  tecnico_assegnato_id uuid REFERENCES utenti(id),
  ciclo_corrente int NOT NULL DEFAULT 1, -- ultimo ciclo generato (per "genera prossimo ciclo")
  creato_il timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_piani_visite_sede ON piani_visite(sede_id);

CREATE TRIGGER trg_piani_visite_aggiornato
  BEFORE UPDATE ON piani_visite
  FOR EACH ROW EXECUTE FUNCTION update_aggiornato_il();

-- ── Tabella visite_pianificate (gli slot) ───────────────────────────────────
CREATE TABLE visite_pianificate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piano_id uuid NOT NULL REFERENCES piani_visite(id) ON DELETE CASCADE,
  sede_id uuid NOT NULL REFERENCES sedi(id) ON DELETE CASCADE, -- denormalizzato per query dirette
  numero_visita int NOT NULL,             -- 1..N nel ciclo
  ciclo_numero int NOT NULL DEFAULT 1,    -- distingue ciclo 1, 2, ... nel tempo
  data_suggerita date NOT NULL,           -- calcolata automaticamente
  data_pianificata date,                  -- impostata a mano dal reparto pianificazione
  stato stato_slot_pianificato NOT NULL DEFAULT 'da_pianificare',
  visita_id uuid REFERENCES visite(id) ON DELETE SET NULL, -- aggancio alla chiusura verbale
  creato_il timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vp_sede ON visite_pianificate(sede_id);
CREATE INDEX idx_vp_piano_ciclo ON visite_pianificate(piano_id, ciclo_numero);
CREATE INDEX idx_vp_stato ON visite_pianificate(stato);
CREATE INDEX idx_vp_visita ON visite_pianificate(visita_id);

CREATE TRIGGER trg_vp_aggiornato
  BEFORE UPDATE ON visite_pianificate
  FOR EACH ROW EXECUTE FUNCTION update_aggiornato_il();

-- ── RLS single-tenant (stesso pattern di scadenze/sedi) ─────────────────────
ALTER TABLE piani_visite ENABLE ROW LEVEL SECURITY;
CREATE POLICY "piani_visite_select" ON piani_visite FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "piani_visite_insert" ON piani_visite FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "piani_visite_update" ON piani_visite FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "piani_visite_delete" ON piani_visite FOR DELETE USING (is_admin());

ALTER TABLE visite_pianificate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vp_select" ON visite_pianificate FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "vp_insert" ON visite_pianificate FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "vp_update" ON visite_pianificate FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "vp_delete" ON visite_pianificate FOR DELETE USING (is_admin());

-- ── Funzione: genera gli slot di un ciclo (da numero p_da_numero a N) ────────
-- Distribuzione uniforme: offset_mesi(numero) = round((numero-1) * 12 / N).
-- p_da_numero (default 1) consente di rigenerare solo la coda non eseguita.
-- Riusa calcola_scadenza() (Sprint 12.3) per la somma di mesi con clamp fine mese.
-- SECURITY INVOKER (default): l'INSERT rispetta la RLS del chiamante. Corpo
-- schema-qualificato (public.*).
CREATE OR REPLACE FUNCTION public.genera_slot_ciclo(
  p_piano_id uuid,
  p_sede_id uuid,
  p_ciclo int,
  p_data_inizio date,
  p_visite_anno int,
  p_da_numero int DEFAULT 1
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_num int;
  v_offset int;
  v_count int := 0;
BEGIN
  IF p_visite_anno < 1 THEN
    RAISE EXCEPTION 'visite_anno deve essere >= 1 (ricevuto %)', p_visite_anno;
  END IF;

  FOR v_num IN GREATEST(p_da_numero, 1) .. p_visite_anno LOOP
    v_offset := round((v_num - 1) * 12.0 / p_visite_anno)::int;
    INSERT INTO public.visite_pianificate (
      piano_id, sede_id, numero_visita, ciclo_numero, data_suggerita, stato
    ) VALUES (
      p_piano_id, p_sede_id, v_num, p_ciclo,
      public.calcola_scadenza(p_data_inizio, v_offset),
      'da_pianificare'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── Funzione: ricalcola gli slot NON eseguiti di un ciclo (cambio piano) ─────
-- Elimina gli slot 'da_pianificare'/'pianificata' del ciclo e rigenera la coda
-- a partire dal primo numero non eseguito, con la nuova distribuzione. Gli slot
-- 'eseguita' (visita_id valorizzata) NON vengono mai toccati.
CREATE OR REPLACE FUNCTION public.ricalcola_slot_ciclo(
  p_piano_id uuid,
  p_sede_id uuid,
  p_ciclo int,
  p_data_inizio date,
  p_visite_anno int
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_eseguiti int;
BEGIN
  DELETE FROM public.visite_pianificate
  WHERE piano_id = p_piano_id AND ciclo_numero = p_ciclo AND stato <> 'eseguita';

  SELECT count(*) INTO v_eseguiti
  FROM public.visite_pianificate
  WHERE piano_id = p_piano_id AND ciclo_numero = p_ciclo AND stato = 'eseguita';

  RETURN public.genera_slot_ciclo(
    p_piano_id, p_sede_id, p_ciclo, p_data_inizio, p_visite_anno, v_eseguiti + 1
  );
END;
$$;

-- ── Funzione: genera il ciclo successivo ────────────────────────────────────
-- Avanza il piano al ciclo corrente+1: nuova data_inizio = fine del ciclo
-- precedente (data_inizio + 12 mesi), stessi visite_anno e tecnico del piano
-- (che riflettono eventuali modifiche fatte nel frattempo). Genera i nuovi N slot.
-- Azione SEMPRE manuale (nessun cron): richiamata da RPC dal reparto pianificazione.
CREATE OR REPLACE FUNCTION public.genera_prossimo_ciclo(p_piano_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_piano public.piani_visite;
  v_nuovo_ciclo int;
  v_nuova_data date;
BEGIN
  SELECT * INTO v_piano FROM public.piani_visite WHERE id = p_piano_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Piano % inesistente', p_piano_id;
  END IF;

  v_nuovo_ciclo := v_piano.ciclo_corrente + 1;
  v_nuova_data := public.calcola_scadenza(v_piano.data_inizio_ciclo, 12);

  UPDATE public.piani_visite
  SET ciclo_corrente = v_nuovo_ciclo, data_inizio_ciclo = v_nuova_data
  WHERE id = p_piano_id;

  RETURN public.genera_slot_ciclo(
    p_piano_id, v_piano.sede_id, v_nuovo_ciclo, v_nuova_data, v_piano.visite_anno
  );
END;
$$;
