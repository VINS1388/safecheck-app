-- ============================================================
-- SafeCheck — Migration 034 (Sprint 19.A · Multi-tenancy — Data foundation)
--
-- PURAMENTE ADDITIVA. Le 21 policy RLS esistenti e i 7 helper esistenti
-- (is_admin, is_attivo, is_planner, is_admin_or_planner, can_read_visita,
-- can_access_sede, can_access_cliente) restano GLOBALI e INVARIATI: ZERO cambio
-- di comportamento per gli utenti reali. Il cutover di sicurezza org-aware è
-- 19.C, NON qui. I trigger trg_utenti_anti_escalation / trg_utenti_anti_lockout
-- NON sono toccati.
--
-- Contenuto:
--   1. Evoluzione `organizzazione` (rilassa singleton, + slug, + stato).
--   2. Tabella ponte `organizzazione_membri` (N:M utente↔org, ruolo/stato).
--   3. current_org_id() e can_write_visita() — CREATE ma NON referenziate da
--      alcuna policy in questo sub-sprint (pronte per 19.C, verificabili ora).
--   4. organization_id (nullable, CON DEFAULT = org di default) + indice su
--      clienti/sedi/visite/visite_pianificate/piani_visite/scadenze.
--   5. Backfill di tutte le righe esistenti verso l'org di default.
--   6. Numerazione: UNIQUE(numero_verbale) → UNIQUE(organization_id, numero_verbale).
--
-- Il DEFAULT su organization_id (punto 4) chiude la finestra tra questo backfill e
-- 19.B: qualunque riga creata nel frattempo eredita l'org di default invece di NULL
-- (che in 19.C, con RLS org-aware, sparirebbe silenziosamente dalla vista → bug di
-- SPARIZIONE dati, non solo di isolamento). Il DEFAULT vale solo per le righe FUTURE:
-- il backfill esplicito qui sotto è comunque necessario per le righe già esistenti.
--
-- NOT NULL su organization_id: RIMANDATO a un sub-sprint successivo (dopo verifica
-- prolungata in prod). audit_events.organization_id: SOLO backfill, resta NULLABLE e
-- SENZA default (deve poter registrare eventi senza org risolvibile anche in futuro).
--
-- L'org di default è risolta DINAMICAMENTE (nessun UUID magico hardcoded).
-- IDEMPOTENTE dove sensato.
-- ============================================================

-- ============================================================
-- 1. EVOLUZIONE `organizzazione` (D1)
-- ============================================================
-- Rilassa il singleton: la tabella diventa multi-riga (l'onboarding di nuove org è
-- Sprint 20; qui resta una sola riga, che diventa l'org di default). La colonna
-- `singleton` resta VESTIGIALE (non droppata), coerente con lo stile del progetto.
ALTER TABLE public.organizzazione DROP CONSTRAINT IF EXISTS organizzazione_solo_true;
ALTER TABLE public.organizzazione DROP CONSTRAINT IF EXISTS organizzazione_singleton_uniq;

ALTER TABLE public.organizzazione ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.organizzazione
  ADD COLUMN IF NOT EXISTS stato text NOT NULL DEFAULT 'attiva'
  CHECK (stato IN ('attiva', 'sospesa'));

-- Slug per la riga esistente (idempotente). Fallback deterministico per eventuali
-- altre righe prive di slug (non attese oggi).
UPDATE public.organizzazione
SET slug = 'studio-bilello'
WHERE slug IS NULL AND ragione_sociale = 'Studio Bilello';
UPDATE public.organizzazione
SET slug = 'org-' || left(id::text, 8)
WHERE slug IS NULL;

ALTER TABLE public.organizzazione DROP CONSTRAINT IF EXISTS organizzazione_slug_key;
ALTER TABLE public.organizzazione ADD CONSTRAINT organizzazione_slug_key UNIQUE (slug);

-- ============================================================
-- 2. TABELLA PONTE `organizzazione_membri` (D2)
-- ============================================================
-- N:M utente↔org GRATIS per costruzione (oggi popolata 1:1). `stato` (membership
-- nell'org) è DISTINTO da utenti.attivo (account globale). Nome italiano: entità di
-- dominio, non infrastruttura. Indice dedicato su user_id per il lookup di
-- current_org_id() (che interroga per user_id, non per organization_id).
CREATE TABLE IF NOT EXISTS public.organizzazione_membri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizzazione(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
  ruolo public.ruolo_utente NOT NULL,
  stato text NOT NULL DEFAULT 'attivo' CHECK (stato IN ('attivo', 'sospeso')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organizzazione_membri_user
  ON public.organizzazione_membri (user_id);

-- RLS abilitata SENZA policy (deny-all ai ruoli client): il ruolo è un dato
-- sensibile e la tabella è esposta via PostgREST. Le SECURITY DEFINER (current_org_id)
-- e il service_role (usato da 19.B) bypassano la RLS e continuano a funzionare. Le
-- policy per-ruolo su questa tabella arrivano in 19.C insieme ai trigger.
ALTER TABLE public.organizzazione_membri ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. HELPER PRONTI PER 19.C (create ma NON usate da alcuna policy in 19.A)
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  -- FAIL-CLOSED (D3.1): ritorna l'organizzazione attiva SOLO se l'utente autenticato
  -- ha ESATTAMENTE UNA membership attiva. Qualsiasi ambiguità — 0 membership, 2+
  -- membership (nessuno switcher in Sprint 19, D4), oppure auth.uid() NULL — ritorna
  -- NULL. Ogni chiamante DEVE trattare NULL come "accesso negato". STABLE: valutata
  -- una volta per query. In 19.A NESSUNA policy la usa ancora (cutover in 19.C).
  SELECT sub.organization_id
  FROM (
    SELECT m.organization_id, count(*) OVER () AS n
    FROM public.organizzazione_membri m
    WHERE m.user_id = auth.uid() AND m.stato = 'attivo'
  ) sub
  WHERE sub.n = 1;
$$;

-- NB: can_write_visita() referenzia visite.organization_id ed è LANGUAGE sql (corpo
-- validato alla creazione) → va creata DOPO l'aggiunta della colonna (fine punto 4).

-- ============================================================
-- 4 + 5. organization_id (nullable, DEFAULT = org di default) + BACKFILL
-- ============================================================
-- Un unico DO block risolve l'org di default una volta e la inietta come DEFAULT
-- literal (i DEFAULT di colonna non ammettono sottoquery) e come valore di backfill.
DO $mt$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org
  FROM public.organizzazione
  WHERE ragione_sociale = 'Studio Bilello'
  ORDER BY creato_il
  LIMIT 1;
  IF v_org IS NULL THEN
    SELECT id INTO v_org FROM public.organizzazione ORDER BY creato_il LIMIT 1;
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nessuna organizzazione di default trovata: impossibile procedere.';
  END IF;

  -- 5.0 — Backfill membri (una membership per utente esistente).
  INSERT INTO public.organizzazione_membri (organization_id, user_id, ruolo, stato)
  SELECT v_org, u.id, u.ruolo,
         CASE WHEN u.attivo THEN 'attivo' ELSE 'sospeso' END
  FROM public.utenti u
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- 4 — Colonne organization_id CON DEFAULT (via dynamic SQL per iniettare v_org),
  --     FK verso organizzazione(id). Le righe esistenti ricevono subito il DEFAULT.
  EXECUTE format('ALTER TABLE public.clienti            ADD COLUMN IF NOT EXISTS organization_id uuid DEFAULT %L REFERENCES public.organizzazione(id)', v_org);
  EXECUTE format('ALTER TABLE public.sedi               ADD COLUMN IF NOT EXISTS organization_id uuid DEFAULT %L REFERENCES public.organizzazione(id)', v_org);
  EXECUTE format('ALTER TABLE public.visite             ADD COLUMN IF NOT EXISTS organization_id uuid DEFAULT %L REFERENCES public.organizzazione(id)', v_org);
  EXECUTE format('ALTER TABLE public.visite_pianificate ADD COLUMN IF NOT EXISTS organization_id uuid DEFAULT %L REFERENCES public.organizzazione(id)', v_org);
  EXECUTE format('ALTER TABLE public.piani_visite       ADD COLUMN IF NOT EXISTS organization_id uuid DEFAULT %L REFERENCES public.organizzazione(id)', v_org);
  EXECUTE format('ALTER TABLE public.scadenze           ADD COLUMN IF NOT EXISTS organization_id uuid DEFAULT %L REFERENCES public.organizzazione(id)', v_org);

  -- 5.1 — Backfill righe ESISTENTI (il DEFAULT vale solo per le future), in ordine FK.
  --       clienti = anchor; il resto deriva dal genitore (equivalente a v_org con
  --       una sola org, ma scritto in forma derivata = corretta anche multi-org).
  UPDATE public.clienti SET organization_id = v_org WHERE organization_id IS NULL;

  UPDATE public.sedi s SET organization_id = c.organization_id
  FROM public.clienti c WHERE c.id = s.cliente_id AND s.organization_id IS NULL;

  UPDATE public.visite v SET organization_id = c.organization_id
  FROM public.clienti c WHERE c.id = v.cliente_id AND v.organization_id IS NULL;

  UPDATE public.visite_pianificate vp SET organization_id = s.organization_id
  FROM public.sedi s WHERE s.id = vp.sede_id AND vp.organization_id IS NULL;

  UPDATE public.piani_visite p SET organization_id = s.organization_id
  FROM public.sedi s WHERE s.id = p.sede_id AND p.organization_id IS NULL;

  -- scadenze: 0 righe oggi; forma corretta via subquery correlata (cliente → sede → default).
  UPDATE public.scadenze sc SET organization_id = COALESCE(
    (SELECT c.organization_id FROM public.clienti c WHERE c.id = sc.cliente_id),
    (SELECT s.organization_id FROM public.sedi s WHERE s.id = sc.sede_id),
    v_org
  ) WHERE sc.organization_id IS NULL;

  -- 5.2 — audit_events: SOLO backfill (colonna già esistente da 032, NESSUN default,
  --       resta NULLABLE). Tre livelli di derivazione + fallback org di default per
  --       eventi su entità non risolvibili (es. entity_type='utente' o già rimossa).
  UPDATE public.audit_events ae SET organization_id = COALESCE(
    (SELECT v.organization_id FROM public.visite v  WHERE v.id = ae.entity_id),
    (SELECT c.organization_id FROM public.clienti c WHERE c.id = ae.entity_id),
    (SELECT s.organization_id FROM public.sedi s    WHERE s.id = ae.entity_id),
    v_org
  ) WHERE ae.organization_id IS NULL;
END
$mt$;

-- Indici su organization_id (fuori dal DO block: DDL statica, non serve v_org).
CREATE INDEX IF NOT EXISTS idx_clienti_org            ON public.clienti (organization_id);
CREATE INDEX IF NOT EXISTS idx_sedi_org               ON public.sedi (organization_id);
CREATE INDEX IF NOT EXISTS idx_visite_org             ON public.visite (organization_id);
CREATE INDEX IF NOT EXISTS idx_visite_pianificate_org ON public.visite_pianificate (organization_id);
CREATE INDEX IF NOT EXISTS idx_piani_visite_org       ON public.piani_visite (organization_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_org           ON public.scadenze (organization_id);

-- Helper pronto per 19.C — creato ORA che visite.organization_id esiste (LANGUAGE
-- sql: corpo validato alla creazione). NON referenziato da alcuna policy in 19.A.
CREATE OR REPLACE FUNCTION public.can_write_visita(p_visita_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  -- Mutazione su entità appese a una visita (risposte/punteggi/verbali_pdf/imprese):
  -- own_or_admin MA org-safe. FAIL-CLOSED: la visita deve appartenere a
  -- current_org_id() (NULL → nessun match → nega), poi own_or_admin. Chiude il buco
  -- per cui il ramo is_admin() delle policy leaf non guarda l'org della visita.
  -- In 19.A NESSUNA policy la usa ancora (cutover in 19.C).
  SELECT EXISTS (
    SELECT 1 FROM public.visite v
    WHERE v.id = p_visita_id
      AND v.organization_id = public.current_org_id()
      AND (v.specialist_id = auth.uid() OR public.is_admin())
  );
$$;

-- ============================================================
-- 6. NUMERAZIONE VERBALI PER-ORGANIZZAZIONE (D6)
-- ============================================================
-- Sostituisce l'unicità GLOBALE con quella per-org. Con una sola org è equivalente
-- al vecchio vincolo, quindi non rompe nulla; prepara la numerazione per-org di 19.D.
-- assegna_numero_verbale() NON è toccata qui (resta globale per prefisso+anno).
ALTER TABLE public.visite DROP CONSTRAINT IF EXISTS visite_numero_verbale_key;
ALTER TABLE public.visite
  ADD CONSTRAINT visite_org_numero_verbale_key UNIQUE (organization_id, numero_verbale);
