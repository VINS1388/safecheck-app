-- ============================================================
-- SafeCheck — Migration 026 (HOTFIX Sprint 16 / 025)
-- Il tecnico non riusciva a CREARE una visita: INSERT...RETURNING negato.
--
-- ROOT CAUSE: `creaVisita` fa `.insert().select("id")` → Postgres applica la
-- policy SELECT `visite_select_scope` alla riga del RETURNING. In 025 quella
-- policy era `can_read_visita(id)`, funzione STABLE + SECURITY DEFINER: la sua
-- sotto-query `EXISTS(visite WHERE id=... AND specialist_id=auth.uid())` usa lo
-- snapshot d'inizio-statement, quando la riga appena inserita NON esiste ancora
-- → ritorna false → RETURNING negato (42501). L'admin passava perché
-- is_admin_or_planner() corto-circuita senza interrogare `visite` (da qui il
-- comportamento asimmetrico admin-ok / tecnico-hang osservato in campo).
--
-- FIX: owner-check INLINE nella policy (`specialist_id = auth.uid()`, valutato
-- sulle COLONNE della riga del RETURNING, non via lookup snapshot-bound). Così un
-- utente attivo vede/crea sempre le proprie visite anche durante INSERT...RETURNING.
-- can_read_visita(id) resta come terzo ramo per il caso slot-assegnato (riga già
-- esistente, snapshot corretto) e per admin/planner. is_attivo() preservato → Q4
-- (utente disattivato = nessun accesso) invariato.
--
-- Riguarda SOLO `visite` (unica tabella che inserisce+seleziona la propria riga;
-- le figlie referenziano una visita PREESISTENTE, quindi non sono affette).
-- Idempotente. ADDITIVA sopra la 025.
-- ============================================================

DROP POLICY IF EXISTS "visite_select_scope" ON public.visite;
CREATE POLICY "visite_select_scope" ON public.visite
  FOR SELECT USING (
    public.is_admin_or_planner()
    OR (public.is_attivo() AND specialist_id = auth.uid())
    OR public.can_read_visita(id)
  );
