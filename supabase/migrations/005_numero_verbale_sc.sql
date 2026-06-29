-- ============================================================
-- SafeCheck — Allinea la numerazione verbale al formato SC-YYYY-NNNN
-- (es. SC-2026-0001), come da CLAUDE.md / SPECIFICHE_FUNZIONALI.
-- Sostituisce il precedente prefisso VRB- e il padding a 3 cifre.
-- SECURITY DEFINER: numerazione progressiva GLOBALE (non limitata dalla
-- RLS del chiamante) e atomica per anno.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assegna_numero_verbale(
  p_visita_id UUID,
  p_anno INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_numero INTEGER;
  v_stringa TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero_verbale, '-', 3) AS INTEGER)
  ), 0) + 1
  INTO v_numero
  FROM public.visite
  WHERE numero_verbale LIKE 'SC-' || p_anno || '-%'
    AND numero_verbale IS NOT NULL;

  v_stringa := 'SC-' || p_anno || '-' || LPAD(v_numero::TEXT, 4, '0');

  UPDATE public.visite SET numero_verbale = v_stringa WHERE id = p_visita_id;

  RETURN v_stringa;
END;
$$;
