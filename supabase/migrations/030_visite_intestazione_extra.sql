-- ============================================================
-- SafeCheck — Migration 030 (Sprint HACCP 2 · C4)
-- Storage per i campi intestazione_extra HACCP privi di colonna dedicata.
-- Additiva, old-app-safe: DEFAULT '{}' backfilla le righe esistenti; il vecchio
-- creaVisita non la valorizza e riceve '{}'. Nessuna RLS coinvolta (le policy
-- visite non referenziano questa colonna). Usata solo dai verbali HACCP; i
-- verbali sicurezza restano a '{}'.
--
-- Mappatura intestazione_extra: ora_inizio/referente_presente/note_finali_tecnico
-- riusano visite.ora_inizio/referente_cliente/note_conclusive; i 7 campi restanti
-- (ora_fine, funzione_referente, attivita_in_corso, aree_visitate,
-- aree_non_visitate_motivo, flag_rilievi_fotografici, presa_visione_referente_
-- testuale) vivono in questa colonna JSONB.
-- ============================================================

ALTER TABLE public.visite
  ADD COLUMN IF NOT EXISTS intestazione_extra jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- CLONA_VISITA — invariata rispetto alla 028 TRANNE la copia di intestazione_extra
-- (Duplica/Sostitutivo devono ereditare anche l'intestazione HACCP). Solo questa
-- riga cambia; il DEFAULT '{}' non basta perché l'INSERT è a lista esplicita.
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

  INSERT INTO public.visite (
    sede_id, cliente_id, specialist_id, modulo_id,
    template_master_id, template_cliente_id, template_sede_id, template_snapshot,
    data_visita, ora_inizio, referente_cliente, qualifica_tecnico, note_preliminari,
    note_modifiche, note_conclusive, intestazione_extra,
    numero_verbale, stato, stato_verbale,
    derivato_da, sostituisce, sostituito_da
  )
  VALUES (
    v_src.sede_id, v_src.cliente_id, v_src.specialist_id, v_src.modulo_id,
    v_src.template_master_id, v_src.template_cliente_id, v_src.template_sede_id, v_src.template_snapshot,
    CURRENT_DATE, v_src.ora_inizio, v_src.referente_cliente, v_src.qualifica_tecnico, v_src.note_preliminari,
    v_src.note_modifiche, v_src.note_conclusive, v_src.intestazione_extra,
    NULL, 'bozza', NULL,
    CASE WHEN p_sostitutivo THEN NULL ELSE p_source_id END,
    CASE WHEN p_sostitutivo THEN p_source_id ELSE NULL END,
    NULL
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.risposte (
    visita_id, domanda_id, sezione_id, valore, osservazioni,
    azione_correttiva, osservazione_evidenza, campo_extra
  )
  SELECT
    v_new_id, domanda_id, sezione_id, valore, osservazioni,
    azione_correttiva, osservazione_evidenza, campo_extra
  FROM public.risposte
  WHERE visita_id = p_source_id;

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

  IF p_sostitutivo THEN
    UPDATE public.visite
    SET stato_verbale = 'sostituito', sostituito_da = v_new_id
    WHERE id = p_source_id;
  END IF;

  RETURN v_new_id;
END;
$$;
