-- ============================================================
-- SafeCheck — Migration 037 (E2 · RBAC su template_cliente / template_sede)
--
-- BUG (dalle policy 002): template_cliente_write_authenticated e
-- template_sede_write_authenticated sono FOR ALL USING (auth.uid() IS NOT NULL):
-- qualunque utente autenticato — anche un tecnico — scrive gli override di
-- template di QUALSIASI cliente/sede. In più una FOR ALL copre anche la SELECT:
-- sommata alle *_select_all (pure auth.uid() IS NOT NULL) la lettura è aperta a
-- ogni autenticato, senza alcuno scoping.
--
-- FIX: si separa la FOR ALL in policy PER-COMANDO (una singola FOR ALL non può
-- esprimere condizioni diverse per SELECT vs scrittura):
--   SELECT      → can_access_cliente(cliente_id) / can_access_sede(sede_id)
--                 (raggiungibilità: admin/planner tutto; tecnico solo il
--                  cliente/sede su cui ha una visita o uno slot assegnato)
--   INS/UPD/DEL → is_admin_or_planner()
-- Stesso pattern di anagrafica clienti/sedi (025/035).
--
-- NB: template_cliente/template_sede NON hanno colonna organization_id (fuori dal
-- perimetro 034) → nessun org-gate qui. È un fix RBAC puro, indipendente dal
-- multi-org. can_access_cliente/sede sono SECURITY DEFINER e valutano le tabelle
-- GENITORE (visite / slot), mai la riga template appena inserita → INSERT...RETURNING
-- resta safe per admin/planner (scope 'all' = true). 0 righe in prod: nessun
-- backfill, nessun dato a rischio.
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS + CREATE.
-- ============================================================

-- ── TEMPLATE_CLIENTE ───────────────────────────────────────
DROP POLICY IF EXISTS "template_cliente_select_all" ON public.template_cliente;
DROP POLICY IF EXISTS "template_cliente_write_authenticated" ON public.template_cliente;

CREATE POLICY "template_cliente_select_scope" ON public.template_cliente
  FOR SELECT USING (public.can_access_cliente(cliente_id));

CREATE POLICY "template_cliente_insert_admin_planner" ON public.template_cliente
  FOR INSERT WITH CHECK (public.is_admin_or_planner());

CREATE POLICY "template_cliente_update_admin_planner" ON public.template_cliente
  FOR UPDATE
  USING (public.is_admin_or_planner())
  WITH CHECK (public.is_admin_or_planner());

CREATE POLICY "template_cliente_delete_admin_planner" ON public.template_cliente
  FOR DELETE USING (public.is_admin_or_planner());

-- ── TEMPLATE_SEDE (raggiungibilità sulla sede) ─────────────
DROP POLICY IF EXISTS "template_sede_select_all" ON public.template_sede;
DROP POLICY IF EXISTS "template_sede_write_authenticated" ON public.template_sede;

CREATE POLICY "template_sede_select_scope" ON public.template_sede
  FOR SELECT USING (public.can_access_sede(sede_id));

CREATE POLICY "template_sede_insert_admin_planner" ON public.template_sede
  FOR INSERT WITH CHECK (public.is_admin_or_planner());

CREATE POLICY "template_sede_update_admin_planner" ON public.template_sede
  FOR UPDATE
  USING (public.is_admin_or_planner())
  WITH CHECK (public.is_admin_or_planner());

CREATE POLICY "template_sede_delete_admin_planner" ON public.template_sede
  FOR DELETE USING (public.is_admin_or_planner());
