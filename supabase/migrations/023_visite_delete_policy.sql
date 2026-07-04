-- ============================================================
-- SafeCheck — Migration 023 (HOTFIX)
-- Eliminazione bozza falliva in silenzio in produzione.
--
-- ROOT CAUSE: `visite` ha RLS abilitata con policy INSERT/SELECT/UPDATE ma
-- NESSUNA policy DELETE. In Postgres, RLS attiva + nessuna policy per un comando
-- = deny-all: ogni DELETE eseguito con la JWT dell'utente autenticato matcha 0
-- righe SENZA errore (non è un errore per PostgREST). L'azione riportava quindi
-- successo mentre non cancellava nulla. (Il superuser del pooler bypassa la RLS,
-- perciò i test as-superuser non lo rilevavano.)
--
-- FIX: aggiunge la policy DELETE con lo STESSO criterio di ownership delle altre
-- (specialist_id = auth.uid() OR is_admin()). Il gate di business "solo bozze
-- eliminabili" resta a livello applicativo (eliminaVisitaBozza), coerente con la
-- filosofia RLS del progetto (ownership in RLS, stato di prodotto nell'app).
--
-- ADDITIVA e idempotente (DROP POLICY IF EXISTS + CREATE).
-- ============================================================

DROP POLICY IF EXISTS "visite_delete_own_or_admin" ON public.visite;
CREATE POLICY "visite_delete_own_or_admin" ON public.visite
  FOR DELETE
  USING ((specialist_id = auth.uid()) OR public.is_admin());
