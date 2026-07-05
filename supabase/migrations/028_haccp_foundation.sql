-- ============================================================
-- SafeCheck — Migration 028 (Sprint HACCP 1 · fondazione modulare)
-- SOLO fondazione: catalogo moduli, attivazione per sede, tipizzazione di
-- template/piani/visite per modulo, numerazione per prefisso. NESSUN contenuto
-- template HACCP (arriva in Sprint HACCP 2).
--
-- PRINCIPIO GUIDA — zero cambiamenti percepiti dal cliente attuale:
--   · la colonna modulo_id nasce NOT NULL con DEFAULT = modulo 'sicurezza'. Il
--     DEFAULT fa TRE cose insieme: (a) backfill istantaneo di tutte le righe
--     esistenti a 'sicurezza'; (b) rende la migration SICURA da applicare PRIMA
--     del deploy del codice Fase C — il vecchio creaVisita/salvaPiano non passa
--     modulo_id e riceve 'sicurezza' senza errori; (c) rete di continuità (il
--     DEFAULT vale SOLO 'sicurezza', mai un HACCP: nessun rischio di
--     assegnazione errata). Il codice H2 imposterà sempre modulo_id esplicito.
--   · moduli_sede fotografa lo stato di fatto: 'sicurezza' attivo su TUTTE le
--     sedi esistenti. I 3 moduli HACCP nascono a catalogo con attivo=false.
--   · numerazione: 'sicurezza'→'SC' (la serie SC-YYYY-NNNN prosegue senza salti);
--     famiglia haccp→'HACCP' (serie separata per prefisso+anno).
--
-- Helper RLS riusati (migration 025): is_attivo(), is_admin(),
-- is_admin_or_planner(), can_access_sede(). Nessun nuovo helper.
-- IDEMPOTENTE dove possibile. ADDITIVA sopra 025/026/027.
-- ============================================================

-- UUID FISSI dei moduli (deterministici → referenziabili come DEFAULT).
--   sicurezza        a0000000-0000-4000-8000-000000000001
--   haccp_generico   a0000000-0000-4000-8000-000000000002
--   haccp_retail     a0000000-0000-4000-8000-000000000003
--   haccp_collettiva a0000000-0000-4000-8000-000000000004

-- ============================================================
-- 1. CATALOGO MODULI
-- ============================================================
CREATE TABLE IF NOT EXISTS public.moduli (
  id uuid PRIMARY KEY,
  codice text NOT NULL UNIQUE,
  famiglia text NOT NULL CHECK (famiglia IN ('sicurezza', 'haccp')),
  nome_commerciale text NOT NULL,
  prefisso_verbale text NOT NULL,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.moduli (id, codice, famiglia, nome_commerciale, prefisso_verbale, attivo) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'sicurezza',        'sicurezza', 'SafeCheck Sicurezza',                     'SC',    true),
  ('a0000000-0000-4000-8000-000000000002', 'haccp_generico',   'haccp',     'SafeCheck HACCP',                         'HACCP', false),
  ('a0000000-0000-4000-8000-000000000003', 'haccp_retail',     'haccp',     'SafeCheck HACCP Retail',                  'HACCP', false),
  ('a0000000-0000-4000-8000-000000000004', 'haccp_collettiva', 'haccp',     'SafeCheck HACCP Ristorazione Collettiva', 'HACCP', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. ATTIVAZIONE MODULI PER SEDE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.moduli_sede (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id uuid NOT NULL REFERENCES public.sedi(id) ON DELETE CASCADE,
  modulo_id uuid NOT NULL REFERENCES public.moduli(id),
  attivo boolean NOT NULL DEFAULT true,
  attivato_il timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sede_id, modulo_id)
);

-- ============================================================
-- 3. TIPIZZAZIONE PER MODULO (con DEFAULT sicurezza = backfill + old-app-safe)
--    NB: seed moduli già eseguito sopra → il DEFAULT/FK è risolvibile.
-- ============================================================
ALTER TABLE public.template_master
  ADD COLUMN IF NOT EXISTS modulo_id uuid NOT NULL
  DEFAULT 'a0000000-0000-4000-8000-000000000001' REFERENCES public.moduli(id);

ALTER TABLE public.piani_visite
  ADD COLUMN IF NOT EXISTS modulo_id uuid NOT NULL
  DEFAULT 'a0000000-0000-4000-8000-000000000001' REFERENCES public.moduli(id);

ALTER TABLE public.visite
  ADD COLUMN IF NOT EXISTS modulo_id uuid NOT NULL
  DEFAULT 'a0000000-0000-4000-8000-000000000001' REFERENCES public.moduli(id);

-- ============================================================
-- 4. SEED moduli_sede — sicurezza attivo su TUTTE le sedi (stato di fatto)
-- ============================================================
INSERT INTO public.moduli_sede (sede_id, modulo_id, attivo)
SELECT s.id, 'a0000000-0000-4000-8000-000000000001', true
FROM public.sedi s
ON CONFLICT (sede_id, modulo_id) DO NOTHING;

-- ============================================================
-- 5. VINCOLO: un piano per (sede, modulo). Sostituisce la vecchia UNIQUE(sede_id).
--    DO block robusto: individua e droppa qualunque UNIQUE sulle sole colonne
--    {sede_id} (il nome inline auto-generato è tipicamente piani_visite_sede_id_key).
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'piani_visite' AND con.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(con.conkey) AS k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
      ) = ARRAY['sede_id']
  LOOP
    EXECUTE format('ALTER TABLE public.piani_visite DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.piani_visite
  ADD CONSTRAINT piani_visite_sede_modulo_key UNIQUE (sede_id, modulo_id);

-- ============================================================
-- 6. RLS
-- ============================================================
-- moduli: catalogo in sola lettura per gli utenti attivi; nessuna scrittura
-- via app (gestito da migration/seed; l'owner bypassa la RLS).
ALTER TABLE public.moduli ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moduli_select" ON public.moduli;
CREATE POLICY "moduli_select" ON public.moduli
  FOR SELECT USING (public.is_attivo());

-- moduli_sede: SELECT per chi legge la sede; INSERT/UPDATE admin|planner;
-- DELETE solo admin.
-- RETURNING-safe: can_access_sede() e is_admin_or_planner() corto-circuitano su
-- is_admin_or_planner() (i ruoli che scrivono) → il predicato SELECT del
-- RETURNING NON interroga la riga appena inserita (nessuna trappola snapshot).
ALTER TABLE public.moduli_sede ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moduli_sede_select" ON public.moduli_sede;
CREATE POLICY "moduli_sede_select" ON public.moduli_sede
  FOR SELECT USING (public.can_access_sede(sede_id));

DROP POLICY IF EXISTS "moduli_sede_insert" ON public.moduli_sede;
CREATE POLICY "moduli_sede_insert" ON public.moduli_sede
  FOR INSERT WITH CHECK (public.is_admin_or_planner());

DROP POLICY IF EXISTS "moduli_sede_update" ON public.moduli_sede;
CREATE POLICY "moduli_sede_update" ON public.moduli_sede
  FOR UPDATE USING (public.is_admin_or_planner()) WITH CHECK (public.is_admin_or_planner());

DROP POLICY IF EXISTS "moduli_sede_delete" ON public.moduli_sede;
CREATE POLICY "moduli_sede_delete" ON public.moduli_sede
  FOR DELETE USING (public.is_admin());

-- Le policy esistenti su template_master/piani_visite/visite NON referenziano
-- modulo_id → l'aggiunta della colonna non richiede alcun adeguamento.

-- ============================================================
-- 7. NUMERAZIONE PER PREFISSO — firma invariata (app non cambia).
--    Prefisso derivato dal modulo della visita; serie per prefisso+anno.
--    'SC' prosegue la serie esistente; 'HACCP' è una serie separata.
-- ============================================================
CREATE OR REPLACE FUNCTION public.assegna_numero_verbale(
  p_visita_id uuid,
  p_anno integer DEFAULT EXTRACT(YEAR FROM NOW())::integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefix text;
  v_numero integer;
  v_stringa text;
BEGIN
  SELECT m.prefisso_verbale
  INTO v_prefix
  FROM public.visite v
  JOIN public.moduli m ON m.id = v.modulo_id
  WHERE v.id = p_visita_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Prefisso/modulo non risolvibile per la visita %', p_visita_id;
  END IF;

  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_verbale, '-', 3) AS integer)), 0) + 1
  INTO v_numero
  FROM public.visite
  WHERE numero_verbale LIKE v_prefix || '-' || p_anno || '-%'
    AND numero_verbale IS NOT NULL;

  v_stringa := v_prefix || '-' || p_anno || '-' || LPAD(v_numero::text, 4, '0');

  UPDATE public.visite SET numero_verbale = v_stringa WHERE id = p_visita_id;

  RETURN v_stringa;
END;
$$;

-- ============================================================
-- 8. CLONA_VISITA — invariata TRANNE la copia di modulo_id (Duplica/Sostitutivo
--    devono restare identici; il DEFAULT NON basta perché l'INSERT è a lista
--    colonne esplicita). Solo questa riga cambia rispetto alla 014.
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
    note_modifiche, note_conclusive,
    numero_verbale, stato, stato_verbale,
    derivato_da, sostituisce, sostituito_da
  )
  VALUES (
    v_src.sede_id, v_src.cliente_id, v_src.specialist_id, v_src.modulo_id,
    v_src.template_master_id, v_src.template_cliente_id, v_src.template_sede_id, v_src.template_snapshot,
    CURRENT_DATE, v_src.ora_inizio, v_src.referente_cliente, v_src.qualifica_tecnico, v_src.note_preliminari,
    v_src.note_modifiche, v_src.note_conclusive,
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
