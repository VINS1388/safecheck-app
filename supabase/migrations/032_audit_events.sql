-- ============================================================
-- SafeCheck — Migration 032
-- audit_events: registro APPEND-ONLY di tracciabilità applicativa (best-effort).
--
-- Scopo: registrare gli eventi salienti del ciclo di vita di visite/verbali,
-- utenti, clienti e sedi (chi ha fatto cosa, su quale entità, quando). NON è
-- fonte di verità per alcuna logica critica (numerazione, fatturazione, stati):
-- è tracciabilità osservativa, scrivibile in modo non-bloccante dal codice.
--
-- SCELTE STRUTTURALI:
--   · organization_id uuid NULL — predisposizione multi-tenant (Sprint 19), mai
--     valorizzato ora. Nessun indice su di esso finché non serve.
--   · entity_type/event_type sono TEXT LIBERI: nessun CHECK/enum a DB. Il
--     vocabolario controllato vive nei union type TypeScript del helper
--     (src/lib/audit/logAuditEvent.ts) — così ampliarlo non richiede migration.
--   · NIENTE FOREIGN KEY: l'audit deve SOPRAVVIVERE agli hard-delete di
--     utenti/clienti/sedi/visite. Un evento su un'entità poi eliminata resta.
--   · payload jsonb: solo riferimenti/delta minimi, MAI dati sensibili.
--
-- APPEND-ONLY su DUE LIVELLI (difesa in profondità):
--   1) RLS: solo INSERT (authenticated) e SELECT (solo admin). Nessuna policy
--      UPDATE/DELETE per NESSUN ruolo → RLS le nega a tutti.
--   2) ACL/GRANT: si revoca tutto (compresi i grant di default Supabase su
--      authenticated/anon) e si concede solo INSERT,SELECT a authenticated.
--
-- ADDITIVA. Nessun dato applicativo toccato.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,                       -- multi-tenant-ready (Sprint 19), mai valorizzato ora
  entity_type text NOT NULL,                  -- vocabolario nei union type TS, non a DB
  entity_id uuid NOT NULL,
  actor_user_id uuid,                          -- NULL ammesso (evento di sistema / attore ignoto)
  event_type text NOT NULL,                   -- vocabolario nei union type TS, non a DB
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Due soli indici. Query per timeline di una singola entità (la più frequente)
-- e feed globale cronologico. Nessun indice su organization_id (Sprint 19).
CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON public.audit_events (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON public.audit_events (created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- ── RLS ──────────────────────────────────────────────────────
-- INSERT: qualunque autenticato. WITH CHECK (true) VOLUTAMENTE senza is_attivo():
-- l'audit deve registrare ANCHE l'attività di utenti disattivati (è un log di
-- sicurezza). Il blocco di chi può fare cosa è affidato ai guard applicativi e
-- alle RLS di business delle tabelle interessate, non a questa.
DROP POLICY IF EXISTS "audit_insert_authenticated" ON public.audit_events;
CREATE POLICY "audit_insert_authenticated" ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- SELECT: solo admin (is_admin(), già in prod). I non-admin non rileggono nulla
-- — da cui il pass-through: un INSERT...RETURNING dei non-admin è negato (il
-- RETURNING passa dalla SELECT policy). Il helper insert SENZA .select() apposta.
DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_events;
CREATE POLICY "audit_select_admin" ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- NESSUNA policy UPDATE/DELETE: la RLS le nega a tutti i ruoli (admin incluso).
-- L'append-only è così garantito anche contro un admin.

-- ── ACL/GRANT ────────────────────────────────────────────────
-- Supabase concede grant di default a anon/authenticated sulle nuove tabelle
-- public: vanno revocati e ridati in modo mirato, altrimenti anon potrebbe
-- inserire (bypassando l'intento) e authenticated avrebbe UPDATE/DELETE a
-- livello privilegi (fermati solo dalla RLS). REVOKE prima, GRANT minimo dopo.
REVOKE ALL ON public.audit_events FROM PUBLIC;
REVOKE ALL ON public.audit_events FROM anon;
REVOKE ALL ON public.audit_events FROM authenticated;
GRANT INSERT, SELECT ON public.audit_events TO authenticated;
-- service_role non toccato: mantiene il pieno accesso (job/manutenzione).
