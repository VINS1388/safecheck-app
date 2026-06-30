-- ============================================================
-- SafeCheck — Migration 014
-- Sprint 11: deep clone transazionale di un verbale (Duplica / Crea sostitutivo).
--
-- Verifica schema (Step 0): le colonne di genealogia (derivato_da,
-- sostituisce, sostituito_da) esistono GIÀ su `visite` (self-FK nullable,
-- migration 001) → nessuna nuova colonna. Questa migration aggiunge solo la
-- funzione di clone, necessaria per garantire l'ATOMICITÀ richiesta (tutte le
-- tabelle clonate o nessuna) non ottenibile con chiamate Supabase separate.
--
-- Mapping stati reale: "chiuso" = stato_verbale='chiuso' (stato='verbale_generato');
-- "sostituito" = stato_verbale='sostituito'. Il nuovo verbale nasce SEMPRE come
-- bozza con numero_verbale = NULL: il numero SC-YYYY-NNNN viene assegnato alla
-- generazione del SUO PDF (decisione Sprint 11), come per ogni altra bozza.
--
-- Clona: risposte (inclusa la riga sintetica nominativi SEZ-01), imprese_appalto
-- e risposte_imprese_appalto (con remap impresa_id). NON tocca verbali_pdf del
-- sorgente. punteggi_sezione non è mai popolata dall'app → non clonata.
--
-- SECURITY DEFINER (come assegna_numero_verbale): l'atomicità e il clone sono
-- demandati al DB; l'autorizzazione è garantita a monte dalla route API che
-- valida la proprietà del verbale (getVisitaById, RLS) prima di chiamare.
-- ============================================================

CREATE OR REPLACE FUNCTION public.clona_visita(
  p_source_id uuid,
  p_sostitutivo boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_src public.visite;
  v_new_id uuid;
  v_imp public.imprese_appalto;
  v_new_imp uuid;
BEGIN
  SELECT * INTO v_src FROM public.visite WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verbale sorgente % inesistente', p_source_id;
  END IF;

  -- Nuovo verbale: copia anagrafica/template/note, stato bozza, numero NULL,
  -- genealogia in base alla modalità.
  INSERT INTO public.visite (
    sede_id, cliente_id, specialist_id,
    template_master_id, template_cliente_id, template_sede_id, template_snapshot,
    data_visita, ora_inizio, referente_cliente, qualifica_tecnico, note_preliminari,
    note_modifiche, note_conclusive,
    numero_verbale, stato, stato_verbale,
    derivato_da, sostituisce, sostituito_da
  )
  VALUES (
    v_src.sede_id, v_src.cliente_id, v_src.specialist_id,
    v_src.template_master_id, v_src.template_cliente_id, v_src.template_sede_id, v_src.template_snapshot,
    CURRENT_DATE, v_src.ora_inizio, v_src.referente_cliente, v_src.qualifica_tecnico, v_src.note_preliminari,
    v_src.note_modifiche, v_src.note_conclusive,
    NULL, 'bozza', NULL,
    CASE WHEN p_sostitutivo THEN NULL ELSE p_source_id END,
    CASE WHEN p_sostitutivo THEN p_source_id ELSE NULL END,
    NULL
  )
  RETURNING id INTO v_new_id;

  -- Risposte standard (inclusa la riga sintetica nominativi SEZ-01).
  INSERT INTO public.risposte (
    visita_id, domanda_id, sezione_id, valore, osservazioni,
    azione_correttiva, osservazione_evidenza, campo_extra
  )
  SELECT
    v_new_id, domanda_id, sezione_id, valore, osservazioni,
    azione_correttiva, osservazione_evidenza, campo_extra
  FROM public.risposte
  WHERE visita_id = p_source_id;

  -- Imprese (SEZ-08 multi-impresa) + relative risposte, con remap impresa_id.
  FOR v_imp IN
    SELECT * FROM public.imprese_appalto WHERE visita_id = p_source_id
  LOOP
    INSERT INTO public.imprese_appalto (visita_id, ragione_sociale, tipo_impresa, ordine)
    VALUES (v_new_id, v_imp.ragione_sociale, v_imp.tipo_impresa, v_imp.ordine)
    RETURNING id INTO v_new_imp;

    INSERT INTO public.risposte_imprese_appalto (
      impresa_id, domanda_id, esito, osservazione, azione_correttiva
    )
    SELECT v_new_imp, domanda_id, esito, osservazione, azione_correttiva
    FROM public.risposte_imprese_appalto
    WHERE impresa_id = v_imp.id;
  END LOOP;

  -- Crea sostitutivo: l'originale passa a "sostituito" e punta al nuovo.
  IF p_sostitutivo THEN
    UPDATE public.visite
    SET stato_verbale = 'sostituito', sostituito_da = v_new_id
    WHERE id = p_source_id;
  END IF;

  RETURN v_new_id;
END;
$$;
