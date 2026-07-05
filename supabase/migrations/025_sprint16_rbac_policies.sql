-- ============================================================
-- SafeCheck — Migration 025 (Sprint 16 · RBAC — parte 2/2)
-- Helper SQL + policy per-ruolo + trigger anti-escalation.
--
-- Prerequisito: migration 024 (enum ruolo_utente contiene 'planner') GIÀ
-- applicata e COMMITTATA in prod (verificato). Questa migration referenzia
-- 'planner' nelle funzioni/policy: senza 024 committata i test BEGIN…ROLLBACK
-- fallirebbero (ALTER TYPE ... ADD VALUE non è usabile nella stessa tx).
--
-- Modello ruoli (rif. src/lib/auth/rbac.ts, foundation Sprint 16 già committata —
-- questa migration ne è il MIRROR RLS, il confine di sicurezza server-side):
--   · admin    → tutto + gestione utenti
--   · planner  → tutto l'operativo (clienti/sedi/piani/slot/assegnazioni),
--                lettura verbali; NO gestione utenti, NO chiusura/eliminazione
--                verbali altrui (supervisione = sola lettura)
--   · specialist/tecnico → solo il raggiungibile (visite proprie ∪ slot assegnati
--                ∪ slot "Da assegnare" che può prendere in carico); elimina solo
--                bozze proprie
--   · attivo=false → nessun ruolo/permesso (accesso negato)
--
-- IDEMPOTENTE: ogni policy è DROP POLICY IF EXISTS + CREATE; le funzioni sono
-- CREATE OR REPLACE. ADDITIVA sui dati (nessun UPDATE/DELETE su righe utente).
--
-- ⚠️ DECISIONI RICOSTRUITE DAL RIEPILOGO APPROVATO (mirror di rbac.ts /
--    canManagePlanning + P6.3 "restano is_admin_or_planner()"), evidenziate nel
--    report pre-apply: le SCRITTURE su clienti/sedi/piani_visite/scadenze passano
--    a is_admin_or_planner(). Conseguenza: un account 'specialist' NON potrà più
--    creare/modificare anagrafiche e piani (gestione = admin/planner).
-- ============================================================

-- ============================================================
-- SEZIONE A — Helper (SECURITY DEFINER, SET search_path='', schema-qualificati)
-- SECURITY DEFINER: eseguono come owner (postgres) → bypassano la RLS delle
-- tabelle lette, evitando ricorsione di policy e permettendo di leggere `utenti`
-- anche a chi non ha SELECT su altre righe.
-- ============================================================

-- is_admin() ESTESO con attivo=true (Q4). CREATE OR REPLACE del preesistente (002).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.utenti
    WHERE id = auth.uid() AND ruolo = 'admin' AND attivo = true
  );
$$;

-- Utente corrente autenticato e attivo?
CREATE OR REPLACE FUNCTION public.is_attivo()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.utenti WHERE id = auth.uid() AND attivo = true
  );
$$;

-- Utente corrente planner attivo?
CREATE OR REPLACE FUNCTION public.is_planner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.utenti
    WHERE id = auth.uid() AND ruolo = 'planner' AND attivo = true
  );
$$;

-- admin OR planner (entrambi già implicano attivo=true).
CREATE OR REPLACE FUNCTION public.is_admin_or_planner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_admin() OR public.is_planner();
$$;

-- Accesso in LETTURA a una visita: admin/planner sempre; tecnico se è propria
-- o è collegata a uno slot a lui assegnato (mirror di rbac.canAccessVisita,
-- livello-visita come da riepilogo approvato).
CREATE OR REPLACE FUNCTION public.can_read_visita(p_visita_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_admin_or_planner()
     OR (public.is_attivo() AND (
          EXISTS (
            SELECT 1 FROM public.visite v
            WHERE v.id = p_visita_id AND v.specialist_id = auth.uid()
          )
       OR EXISTS (
            SELECT 1 FROM public.visite_pianificate vp
            WHERE vp.visita_id = p_visita_id AND vp.tecnico_assegnato_id = auth.uid()
          )
     ));
$$;

-- Accesso in LETTURA a una sede: admin/planner sempre; tecnico se raggiungibile
-- (una sua visita sulla sede o uno slot assegnato sulla sede).
CREATE OR REPLACE FUNCTION public.can_access_sede(p_sede_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_admin_or_planner()
     OR (public.is_attivo() AND (
          EXISTS (
            SELECT 1 FROM public.visite v
            WHERE v.sede_id = p_sede_id AND v.specialist_id = auth.uid()
          )
       OR EXISTS (
            SELECT 1 FROM public.visite_pianificate vp
            WHERE vp.sede_id = p_sede_id AND vp.tecnico_assegnato_id = auth.uid()
          )
     ));
$$;

-- Accesso in LETTURA a un cliente: admin/planner sempre; tecnico se raggiungibile
-- (una sua visita del cliente o uno slot assegnato su una sede del cliente).
CREATE OR REPLACE FUNCTION public.can_access_cliente(p_cliente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_admin_or_planner()
     OR (public.is_attivo() AND (
          EXISTS (
            SELECT 1 FROM public.visite v
            WHERE v.cliente_id = p_cliente_id AND v.specialist_id = auth.uid()
          )
       OR EXISTS (
            SELECT 1 FROM public.visite_pianificate vp
            JOIN public.sedi s ON s.id = vp.sede_id
            WHERE s.cliente_id = p_cliente_id AND vp.tecnico_assegnato_id = auth.uid()
          )
     ));
$$;

-- ============================================================
-- SEZIONE B — Policy per-ruolo
-- ============================================================

-- ── CLIENTI ────────────────────────────────────────────────
-- SELECT: raggiungibile. INSERT/UPDATE: gestione = admin/planner. DELETE: admin (invariata).
DROP POLICY IF EXISTS "clienti_select_authenticated" ON public.clienti;
CREATE POLICY "clienti_select_scope" ON public.clienti
  FOR SELECT USING (public.can_access_cliente(id));

DROP POLICY IF EXISTS "clienti_insert_authenticated" ON public.clienti;
CREATE POLICY "clienti_insert_admin_planner" ON public.clienti
  FOR INSERT WITH CHECK (public.is_admin_or_planner());

DROP POLICY IF EXISTS "clienti_update_authenticated" ON public.clienti;
CREATE POLICY "clienti_update_admin_planner" ON public.clienti
  FOR UPDATE USING (public.is_admin_or_planner()) WITH CHECK (public.is_admin_or_planner());
-- clienti_delete_admin (002) invariata.

-- ── SEDI ───────────────────────────────────────────────────
-- SELECT: raggiungibile. INSERT/UPDATE: admin/planner. DELETE: admin (NEW, P6.4).
DROP POLICY IF EXISTS "sedi_select_authenticated" ON public.sedi;
CREATE POLICY "sedi_select_scope" ON public.sedi
  FOR SELECT USING (public.can_access_sede(id));

DROP POLICY IF EXISTS "sedi_insert_authenticated" ON public.sedi;
CREATE POLICY "sedi_insert_admin_planner" ON public.sedi
  FOR INSERT WITH CHECK (public.is_admin_or_planner());

DROP POLICY IF EXISTS "sedi_update_authenticated" ON public.sedi;
CREATE POLICY "sedi_update_admin_planner" ON public.sedi
  FOR UPDATE USING (public.is_admin_or_planner()) WITH CHECK (public.is_admin_or_planner());

DROP POLICY IF EXISTS "sedi_delete_admin" ON public.sedi;   -- buco deny-all pre-025 (P6.4)
CREATE POLICY "sedi_delete_admin" ON public.sedi
  FOR DELETE USING (public.is_admin());

-- ── VISITE ─────────────────────────────────────────────────
-- SELECT: can_read_visita (aggiunge lettura planner). INSERT: attivo + own o admin/planner.
-- UPDATE/DELETE: own_or_admin (planner ESCLUSO, Q2/Q3) — invariate rispetto a 023.
DROP POLICY IF EXISTS "visite_select_own_or_admin" ON public.visite;
CREATE POLICY "visite_select_scope" ON public.visite
  FOR SELECT USING (public.can_read_visita(id));

DROP POLICY IF EXISTS "visite_insert_authenticated" ON public.visite;
CREATE POLICY "visite_insert_own_or_admin_planner" ON public.visite
  FOR INSERT WITH CHECK (
    public.is_attivo()
    AND (specialist_id = auth.uid() OR public.is_admin_or_planner())
  );
-- visite_update_own_or_admin (002) e visite_delete_own_or_admin (023) INVARIATE
-- (own_or_admin, planner escluso). is_admin() ora implica attivo=true.

-- ── RISPOSTE ───────────────────────────────────────────────
-- SELECT: can_read_visita. INSERT/UPDATE: own_or_admin (invariate). DELETE: own_or_admin (NEW, P6.4).
DROP POLICY IF EXISTS "risposte_select_via_visita" ON public.risposte;
CREATE POLICY "risposte_select_scope" ON public.risposte
  FOR SELECT USING (public.can_read_visita(visita_id));

DROP POLICY IF EXISTS "risposte_delete_via_visita" ON public.risposte;
CREATE POLICY "risposte_delete_via_visita" ON public.risposte
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.visite v
      WHERE v.id = risposte.visita_id
        AND (v.specialist_id = auth.uid() OR public.is_admin())
    )
  );
-- risposte_insert_via_visita / risposte_update_via_visita (002) invariate.

-- ── PUNTEGGI_SEZIONE ───────────────────────────────────────
-- Split della vecchia FOR ALL: SELECT can_read_visita; I/U/D own_or_admin.
DROP POLICY IF EXISTS "punteggi_select_via_visita" ON public.punteggi_sezione;
DROP POLICY IF EXISTS "punteggi_all_via_visita" ON public.punteggi_sezione;

CREATE POLICY "punteggi_select_scope" ON public.punteggi_sezione
  FOR SELECT USING (public.can_read_visita(visita_id));

CREATE POLICY "punteggi_insert_via_visita" ON public.punteggi_sezione
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.visite v
            WHERE v.id = punteggi_sezione.visita_id
              AND (v.specialist_id = auth.uid() OR public.is_admin())));

CREATE POLICY "punteggi_update_via_visita" ON public.punteggi_sezione
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.visite v
            WHERE v.id = punteggi_sezione.visita_id
              AND (v.specialist_id = auth.uid() OR public.is_admin())));

CREATE POLICY "punteggi_delete_via_visita" ON public.punteggi_sezione
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.visite v
            WHERE v.id = punteggi_sezione.visita_id
              AND (v.specialist_id = auth.uid() OR public.is_admin())));

-- ── VERBALI_PDF ────────────────────────────────────────────
-- SELECT: can_read_visita. INSERT: own_or_admin (invariata). UPDATE/DELETE: own_or_admin (NEW, P6.4).
DROP POLICY IF EXISTS "verbali_select_via_visita" ON public.verbali_pdf;
CREATE POLICY "verbali_select_scope" ON public.verbali_pdf
  FOR SELECT USING (public.can_read_visita(visita_id));

DROP POLICY IF EXISTS "verbali_update_via_visita" ON public.verbali_pdf;
CREATE POLICY "verbali_update_via_visita" ON public.verbali_pdf
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.visite v
            WHERE v.id = verbali_pdf.visita_id
              AND (v.specialist_id = auth.uid() OR public.is_admin())));

DROP POLICY IF EXISTS "verbali_delete_via_visita" ON public.verbali_pdf;
CREATE POLICY "verbali_delete_via_visita" ON public.verbali_pdf
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.visite v
            WHERE v.id = verbali_pdf.visita_id
              AND (v.specialist_id = auth.uid() OR public.is_admin())));
-- verbali_insert_via_visita (002) invariata.

-- ── IMPRESE_APPALTO ────────────────────────────────────────
-- Split della FOR ALL (012): SELECT can_read_visita; I/U/D own_or_admin.
DROP POLICY IF EXISTS "imprese_appalto_all_via_visita" ON public.imprese_appalto;

CREATE POLICY "imprese_appalto_select_scope" ON public.imprese_appalto
  FOR SELECT USING (public.can_read_visita(visita_id));

CREATE POLICY "imprese_appalto_insert_via_visita" ON public.imprese_appalto
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.visite v
            WHERE v.id = imprese_appalto.visita_id
              AND (v.specialist_id = auth.uid() OR public.is_admin())));

CREATE POLICY "imprese_appalto_update_via_visita" ON public.imprese_appalto
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.visite v
            WHERE v.id = imprese_appalto.visita_id
              AND (v.specialist_id = auth.uid() OR public.is_admin())));

CREATE POLICY "imprese_appalto_delete_via_visita" ON public.imprese_appalto
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.visite v
            WHERE v.id = imprese_appalto.visita_id
              AND (v.specialist_id = auth.uid() OR public.is_admin())));

-- ── RISPOSTE_IMPRESE_APPALTO (2-hop: impresa → visita) ─────
DROP POLICY IF EXISTS "risposte_imprese_all_via_visita" ON public.risposte_imprese_appalto;

CREATE POLICY "risposte_imprese_select_scope" ON public.risposte_imprese_appalto
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.imprese_appalto ia
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND public.can_read_visita(ia.visita_id)
    )
  );

CREATE POLICY "risposte_imprese_insert_via_visita" ON public.risposte_imprese_appalto
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.imprese_appalto ia
      JOIN public.visite v ON v.id = ia.visita_id
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND (v.specialist_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "risposte_imprese_update_via_visita" ON public.risposte_imprese_appalto
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.imprese_appalto ia
      JOIN public.visite v ON v.id = ia.visita_id
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND (v.specialist_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "risposte_imprese_delete_via_visita" ON public.risposte_imprese_appalto
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.imprese_appalto ia
      JOIN public.visite v ON v.id = ia.visita_id
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND (v.specialist_id = auth.uid() OR public.is_admin())
    )
  );

-- ── PIANI_VISITE ───────────────────────────────────────────
-- SELECT: sede raggiungibile (P6.3, tecnico legge il piano della sua sede).
-- INSERT/UPDATE: admin/planner (P6.3 "I/U restano is_admin_or_planner()"). DELETE: admin (invariata).
DROP POLICY IF EXISTS "piani_visite_select" ON public.piani_visite;
CREATE POLICY "piani_visite_select_scope" ON public.piani_visite
  FOR SELECT USING (public.can_access_sede(sede_id));

DROP POLICY IF EXISTS "piani_visite_insert" ON public.piani_visite;
CREATE POLICY "piani_visite_insert_admin_planner" ON public.piani_visite
  FOR INSERT WITH CHECK (public.is_admin_or_planner());

DROP POLICY IF EXISTS "piani_visite_update" ON public.piani_visite;
CREATE POLICY "piani_visite_update_admin_planner" ON public.piani_visite
  FOR UPDATE USING (public.is_admin_or_planner()) WITH CHECK (public.is_admin_or_planner());
-- piani_visite_delete (021) invariata (is_admin()).

-- ── VISITE_PIANIFICATE (slot) ──────────────────────────────
-- SELECT: admin/planner tutto; tecnico → slot assegnati, slot "Da assegnare"
--   (pool preso-in-carico diretto, P6.1) e slot collegati a una sua visita.
-- INSERT: admin/planner (tecnico negato).
-- UPDATE: admin/planner pieno (policy separata) + tecnico mirata (P6.1).
-- DELETE: admin (invariata).
DROP POLICY IF EXISTS "vp_select" ON public.visite_pianificate;
CREATE POLICY "vp_select_scope" ON public.visite_pianificate
  FOR SELECT USING (
    public.is_admin_or_planner()
    OR (public.is_attivo() AND (
         tecnico_assegnato_id = auth.uid()
      OR tecnico_assegnato_id IS NULL
      OR public.can_read_visita(visita_id)
    ))
  );

DROP POLICY IF EXISTS "vp_insert" ON public.visite_pianificate;
CREATE POLICY "vp_insert_admin_planner" ON public.visite_pianificate
  FOR INSERT WITH CHECK (public.is_admin_or_planner());

DROP POLICY IF EXISTS "vp_update" ON public.visite_pianificate;
DROP POLICY IF EXISTS "vp_update_admin_planner" ON public.visite_pianificate;
CREATE POLICY "vp_update_admin_planner" ON public.visite_pianificate
  FOR UPDATE USING (public.is_admin_or_planner()) WITH CHECK (public.is_admin_or_planner());

-- P6.1 — aggancio del tecnico: slot libero (visita_id NULL, non eseguito) che sia
-- SUO oppure "Da assegnare". WITH CHECK: la visita agganciata deve essere sua e lo
-- slot deve restare suo o non assegnato. La presa-in-carico esplicita (set tecnico=
-- self + tecnico_personalizzato=true) è imposta dall'app (collegaSlot) ed è
-- consentita da questo WITH CHECK.
-- ⚠️ RISCHIO RESIDUO ACCETTATO (P6.1): la RLS non limita le COLONNE dell'UPDATE e
--    WITH CHECK non vede OLD → un tecnico che aggancia potrebbe, nella stessa
--    UPDATE, alterare altre colonne dello slot (data, flag). Lo slot è comunque
--    suo e l'app non espone questa possibilità: accettato, nessun trigger aggiuntivo.
-- is_attivo() incluso in USING e WITH CHECK (difesa in profondità): un tecnico
-- disattivato non può agganciare slot nemmeno a livello RLS (non solo a livello app).
DROP POLICY IF EXISTS "vp_update_tecnico_aggancio" ON public.visite_pianificate;
CREATE POLICY "vp_update_tecnico_aggancio" ON public.visite_pianificate
  FOR UPDATE
  USING (
    public.is_attivo()
    AND visita_id IS NULL
    AND stato <> 'eseguita'
    AND (tecnico_assegnato_id = auth.uid() OR tecnico_assegnato_id IS NULL)
  )
  WITH CHECK (
    public.is_attivo()
    AND EXISTS (
      SELECT 1 FROM public.visite v
      WHERE v.id = visita_id AND v.specialist_id = auth.uid()
    )
    AND (tecnico_assegnato_id = auth.uid() OR tecnico_assegnato_id IS NULL)
  );
-- vp_delete (021) invariata (is_admin()).

-- ── SCADENZE (Sprint 12.3/13, inattivo) ────────────────────
-- SELECT: raggiungibile via cliente/sede. INSERT/UPDATE: admin/planner. DELETE: admin (invariata).
DROP POLICY IF EXISTS "scadenze_select_authenticated" ON public.scadenze;
CREATE POLICY "scadenze_select_scope" ON public.scadenze
  FOR SELECT USING (
    public.is_admin_or_planner()
    OR (public.is_attivo() AND (
         (cliente_id IS NOT NULL AND public.can_access_cliente(cliente_id))
      OR (sede_id IS NOT NULL AND public.can_access_sede(sede_id))
    ))
  );

DROP POLICY IF EXISTS "scadenze_insert_authenticated" ON public.scadenze;
CREATE POLICY "scadenze_insert_admin_planner" ON public.scadenze
  FOR INSERT WITH CHECK (public.is_admin_or_planner());

DROP POLICY IF EXISTS "scadenze_update_authenticated" ON public.scadenze;
CREATE POLICY "scadenze_update_admin_planner" ON public.scadenze
  FOR UPDATE USING (public.is_admin_or_planner()) WITH CHECK (public.is_admin_or_planner());
-- scadenze_delete_admin (018) invariata.

-- ── UTENTI ─────────────────────────────────────────────────
-- Policy INVARIATE (select/update own_or_admin, insert admin). Aggiunto SOLO il
-- trigger anti-escalation P6.2.

-- ============================================================
-- SEZIONE C — Trigger anti-escalation su utenti (P6.2)
-- Impedisce a un non-admin di modificare ruolo/attivo (proprio o altrui).
-- ESENZIONE SERVICE ROLE OBBLIGATORIA: i trigger scattano anche per il service
-- role (che bypassa la RLS ma NON i trigger). L'area /organizzazione e gli script
-- operano via service role → auth.uid() IS NULL → esenti. Anche postgres/superuser
-- (auth.uid() NULL) è esente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_utenti_anti_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL            -- contesto utente reale (non service role/postgres)
     AND NOT public.is_admin()          -- solo l'admin può cambiare ruolo/attivo
     AND (NEW.ruolo IS DISTINCT FROM OLD.ruolo
          OR NEW.attivo IS DISTINCT FROM OLD.attivo)
  THEN
    RAISE EXCEPTION 'Modifica di ruolo/attivo non consentita: richiede privilegi admin.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_utenti_anti_escalation ON public.utenti;
CREATE TRIGGER trg_utenti_anti_escalation
  BEFORE UPDATE ON public.utenti
  FOR EACH ROW EXECUTE FUNCTION public.trg_utenti_anti_escalation();
