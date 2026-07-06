-- ============================================================
-- SafeCheck — Migration 031 (Sprint 16.6)
-- Tabella ORGANIZZAZIONE come SINGLETON (profilo dell'organizzazione corrente).
--
-- Sostituisce la stringa hardcoded "Studio Bilello" (OrganizzazioneClient.tsx) con
-- un'entità dati modificabile. NON è multi-tenancy: è progettata per crescere in
-- Fase 3 (diventerà multi-riga + organizzazione_id sulle altre entità; questa riga
-- diventa l'org di default), ma per ora una sola riga.
--
-- SINGLETON ENFORCED A DB (non per convenzione app):
--   · colonna `singleton boolean NOT NULL DEFAULT true`
--   · CHECK (singleton = true)  → ogni riga è forzata a true
--   · UNIQUE (singleton)        → può esistere UNA sola riga con singleton=true
--   ⇒ combinati: al massimo 1 riga, sempre. Nessun INSERT/DELETE da UI (nessuna
--     policy INSERT/DELETE: la RLS li nega; il seed avviene qui via owner).
--
-- RLS: SELECT per tutti gli autenticati ATTIVI (serve anche per intestazioni/
-- riferimenti); UPDATE solo admin (canManageOrganizzazione, mirror di is_admin()).
--
-- IDEMPOTENTE dove sensato; ADDITIVA. Riusa update_aggiornato_il() e is_attivo()/
-- is_admin() (già in prod).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizzazione (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  ragione_sociale text NOT NULL,
  partita_iva text,
  codice_fiscale text,
  indirizzo text,
  citta text,
  cap text,
  provincia text,
  email text,
  telefono text,
  logo_url text,
  creato_il timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizzazione_solo_true CHECK (singleton = true),
  CONSTRAINT organizzazione_singleton_uniq UNIQUE (singleton)
);

ALTER TABLE public.organizzazione ENABLE ROW LEVEL SECURITY;

-- Lettura: ogni utente autenticato e attivo. Scrittura: solo admin.
DROP POLICY IF EXISTS "org_select_attivi" ON public.organizzazione;
CREATE POLICY "org_select_attivi" ON public.organizzazione
  FOR SELECT USING (public.is_attivo());

DROP POLICY IF EXISTS "org_update_admin" ON public.organizzazione;
CREATE POLICY "org_update_admin" ON public.organizzazione
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
-- Nessuna policy INSERT/DELETE: la RLS le nega a tutti (no create/delete da UI).

DROP TRIGGER IF EXISTS trg_org_aggiornato ON public.organizzazione;
CREATE TRIGGER trg_org_aggiornato
  BEFORE UPDATE ON public.organizzazione
  FOR EACH ROW EXECUTE FUNCTION public.update_aggiornato_il();

-- Seed della riga singleton (via owner in migration → bypassa la RLS).
-- Idempotente: se una riga esiste già, non ne crea una seconda.
INSERT INTO public.organizzazione (ragione_sociale)
SELECT 'Studio Bilello'
WHERE NOT EXISTS (SELECT 1 FROM public.organizzazione);
