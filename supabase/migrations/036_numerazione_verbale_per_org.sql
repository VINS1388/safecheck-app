-- ============================================================
-- SafeCheck — Migration 036 (Sprint 19.D · Numerazione verbale PER-ORG)
--
-- Rende assegna_numero_verbale() consapevole dell'organizzazione. Da 028 la
-- funzione calcola MAX(progressivo) filtrando solo per prefisso+anno, MAI per
-- organization_id: con una sola org è invisibile, ma con una seconda org la
-- sequenza proseguirebbe quella della prima (es. org2 riceverebbe SC-2026-0005
-- invece di SC-2026-0001). Il vincolo UNIQUE(organization_id, numero_verbale)
-- (034) già consentirebbe a ogni org la propria serie: qui la funzione lo sfrutta.
--
-- COSA CAMBIA (unico intervento): il MAX() è ora ristretto alle visite della
-- STESSA organization_id della visita che si sta numerando. Prefisso+anno restano
-- (serie 'SC' e 'HACCP' separate, per-anno) — ora ANCHE per-org.
--
-- FAIL-CLOSED (coerente con current_org_id()/orgIdChiamante()): se la visita ha
-- organization_id NULL la funzione RAISE, NON numera con una scansione globale.
-- La colonna visite.organization_id è nullable (verificato live) + ha DEFAULT
-- l'org corrente, quindi in pratica non è mai NULL; il gate è difesa in profondità.
--
-- INVARIATO: firma (p_visita_id, p_anno), SECURITY DEFINER, search_path='',
-- risoluzione prefisso via moduli, UPDATE finale, modello di concorrenza (il
-- vincolo UNIQUE per-org resta la rete anti-collisione tra generazioni concorrenti
-- — nessun lock introdotto, identico a prima). App e chiamata RPC non cambiano.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION.
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
  v_org uuid;
  v_numero integer;
  v_stringa text;
BEGIN
  -- Prefisso (dal modulo) + org della visita in un'unica lettura.
  SELECT m.prefisso_verbale, v.organization_id
  INTO v_prefix, v_org
  FROM public.visite v
  JOIN public.moduli m ON m.id = v.modulo_id
  WHERE v.id = p_visita_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Prefisso/modulo non risolvibile per la visita %', p_visita_id;
  END IF;

  -- Fail-closed: senza org non si numera (mai fallback a scansione globale).
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'organization_id nullo per la visita %: numerazione per-organizzazione non possibile', p_visita_id;
  END IF;

  -- Progressivo per prefisso+anno RISTRETTO alla stessa organization_id.
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_verbale, '-', 3) AS integer)), 0) + 1
  INTO v_numero
  FROM public.visite
  WHERE organization_id = v_org
    AND numero_verbale LIKE v_prefix || '-' || p_anno || '-%'
    AND numero_verbale IS NOT NULL;

  v_stringa := v_prefix || '-' || p_anno || '-' || LPAD(v_numero::text, 4, '0');

  UPDATE public.visite SET numero_verbale = v_stringa WHERE id = p_visita_id;

  RETURN v_stringa;
END;
$$;
