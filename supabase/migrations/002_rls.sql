-- ============================================================
-- SafeCheck — Row Level Security
-- ============================================================

-- Abilita RLS su tutte le tabelle
ALTER TABLE utenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE clienti ENABLE ROW LEVEL SECURITY;
ALTER TABLE sedi ENABLE ROW LEVEL SECURITY;
ALTER TABLE visite ENABLE ROW LEVEL SECURITY;
ALTER TABLE risposte ENABLE ROW LEVEL SECURITY;
ALTER TABLE punteggi_sezione ENABLE ROW LEVEL SECURITY;
ALTER TABLE verbali_pdf ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_sede ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_audit_log ENABLE ROW LEVEL SECURITY;

-- Helper: ruolo utente corrente
CREATE OR REPLACE FUNCTION get_ruolo_utente()
RETURNS ruolo_utente AS $$
  SELECT ruolo FROM utenti WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: l'utente corrente è admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM utenti
    WHERE id = auth.uid() AND ruolo = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ---- UTENTI ----
CREATE POLICY "utenti_select_own" ON utenti
  FOR SELECT USING (id = auth.uid() OR is_admin());

CREATE POLICY "utenti_update_own" ON utenti
  FOR UPDATE USING (id = auth.uid() OR is_admin());

CREATE POLICY "utenti_insert_admin" ON utenti
  FOR INSERT WITH CHECK (is_admin());

-- ---- CLIENTI ----
CREATE POLICY "clienti_select_authenticated" ON clienti
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "clienti_insert_authenticated" ON clienti
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "clienti_update_authenticated" ON clienti
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "clienti_delete_admin" ON clienti
  FOR DELETE USING (is_admin());

-- ---- SEDI ----
CREATE POLICY "sedi_select_authenticated" ON sedi
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "sedi_insert_authenticated" ON sedi
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sedi_update_authenticated" ON sedi
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ---- VISITE ----
CREATE POLICY "visite_select_own_or_admin" ON visite
  FOR SELECT USING (
    specialist_id = auth.uid() OR is_admin()
  );

CREATE POLICY "visite_insert_authenticated" ON visite
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "visite_update_own_or_admin" ON visite
  FOR UPDATE USING (
    specialist_id = auth.uid() OR is_admin()
  );

-- ---- RISPOSTE ----
CREATE POLICY "risposte_select_via_visita" ON risposte
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = risposte.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "risposte_insert_via_visita" ON risposte
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = risposte.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "risposte_update_via_visita" ON risposte
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = risposte.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

-- ---- PUNTEGGI ----
CREATE POLICY "punteggi_select_via_visita" ON punteggi_sezione
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = punteggi_sezione.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "punteggi_all_via_visita" ON punteggi_sezione
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = punteggi_sezione.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

-- ---- VERBALI PDF ----
CREATE POLICY "verbali_select_via_visita" ON verbali_pdf
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = verbali_pdf.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "verbali_insert_via_visita" ON verbali_pdf
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM visite v
      WHERE v.id = verbali_pdf.visita_id
        AND (v.specialist_id = auth.uid() OR is_admin())
    )
  );

-- ---- TEMPLATE MASTER ----
CREATE POLICY "template_master_select_all" ON template_master
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "template_master_write_admin" ON template_master
  FOR ALL USING (is_admin());

-- ---- TEMPLATE CLIENTE ----
CREATE POLICY "template_cliente_select_all" ON template_cliente
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "template_cliente_write_authenticated" ON template_cliente
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ---- TEMPLATE SEDE ----
CREATE POLICY "template_sede_select_all" ON template_sede
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "template_sede_write_authenticated" ON template_sede
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ---- AUDIT LOG ----
CREATE POLICY "audit_select_admin" ON audit_log
  FOR SELECT USING (is_admin());

CREATE POLICY "audit_insert_authenticated" ON audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
