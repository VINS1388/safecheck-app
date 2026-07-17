-- ============================================================
-- SafeCheck — Migration 035 (Sprint 19.C · Multi-tenancy — CUTOVER org-aware)
--
-- ⚠️ CHECKPOINT AD ALTO RISCHIO. Attiva l'isolamento per-organizzazione su RLS e
-- aggiunge i trigger anti-escalation/anti-lockout PER-ORG su organizzazione_membri.
-- Da 19.A/19.B: organization_id è presente+backfillato su clienti/sedi/visite/
-- visite_pianificate/piani_visite/scadenze; current_org_id() e can_write_visita()
-- esistono (034) ma finora NON erano referenziate da alcuna policy. Questa migration
-- le "accende".
--
-- current_org_id() è FAIL-CLOSED: ritorna l'org solo se l'utente ha ESATTAMENTE una
-- membership attiva, altrimenti NULL. Ogni gate qui sotto tratta NULL come "nega"
-- (un confronto `organization_id = NULL` è NULL → non-true → riga esclusa).
--
-- SCELTE DI DISEGNO APPROVATE (oltre allo schema 19.C di base), evidenziate perché
-- estendono la specifica minima:
--   (A) FAIL-CLOSED SU TUTTI I PATH DI SCRITTURA: l'org-gate è aggiunto anche ai
--       path tecnico/proprietario di `visite` (INSERT owner, UPDATE own_or_admin) e
--       di `visite_pianificate` (vp_update_tecnico_aggancio), non solo alle policy
--       is_admin_or_planner(). `visite_update` (002, aveva solo USING) riceve anche
--       un WITH CHECK per impedire la riassegnazione di organization_id.
--   (B) DELETE ORG-AWARE: le policy DELETE delle 6 tabelle dirette ricevono anch'esse
--       l'org-gate (nemmeno un admin cancella righe di un'altra org).
--   (C) CHIUSURA LETTURE SULLA COLONNA (RETURNING-safe): ogni tabella con colonna
--       organization_id (clienti/sedi/visite/visite_pianificate/piani_visite/scadenze)
--       chiude l'org DIRETTAMENTE sulla propria colonna nella policy SELECT, NON via
--       un helper che rifà EXISTS sulla stessa tabella. Motivo: un helper STABLE che
--       cerca la riga appena inserita non la vede (snapshot di inizio statement) →
--       INSERT…RETURNING (Supabase .insert().select()) fallirebbe (42501). Solo le 5
--       tabelle FOGLIA (senza colonna organization_id) usano can_read_visita org-aware
--       (guarda la VISITA genitore, sempre pre-esistente → RETURNING-safe). Coerente
--       col fix 026. can_access_sede()/can_access_cliente() restano forma 025 (sola
--       raggiungibilità): l'org su clienti/sedi/piani è sulla colonna.
--
-- INVARIATI (E5): is_admin()/is_attivo()/is_planner()/is_admin_or_planner() e i
-- trigger su `utenti` (025 anti-escalation, 027 anti-lockout globale, lock 81027).
-- organizzazione_membri resta DENY-ALL (nessuna policy per authenticated/anon).
--
-- IDEMPOTENTE: DROP POLICY/TRIGGER IF EXISTS + CREATE; funzioni CREATE OR REPLACE.
-- ============================================================

-- ============================================================
-- 1. HELPER DI LETTURA ORG-AWARE (STEP 19C.1)
-- SOLO can_read_visita diventa org-aware: le tabelle FOGLIA (risposte/punteggi/
-- verbali_pdf/imprese_appalto/risposte_imprese_appalto) NON hanno una colonna
-- organization_id propria, quindi il loro unico presidio d'org in lettura è questo
-- helper (che guarda la VISITA genitore, sempre pre-esistente → RETURNING-safe).
-- current_org_id() NULL → nessun match → nega (anche per admin/planner di altra org).
--
-- ⚠️ can_access_sede()/can_access_cliente() NON sono più resi org-aware qui
-- (restano nella forma 025, sola raggiungibilità). Motivo — RETURNING-safety: se il
-- gate d'org fosse un EXISTS sul MEDESIMO record appena inserito (clienti/sedi),
-- una INSERT…RETURNING (Supabase .insert().select()) fallirebbe: la funzione STABLE
-- valuta lo snapshot di inizio statement e NON vede la riga appena scritta →
-- can_access_* = false → policy SELECT del RETURNING negata (42501). clienti/sedi/
-- piani_visite HANNO una colonna organization_id propria: l'org si chiude sulla
-- COLONNA della riga nelle rispettive policy SELECT (Sezione 2), come già fanno
-- visite/vp/scadenze. is_admin()/is_attivo()/is_planner()/is_admin_or_planner()
-- NON toccati.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_read_visita(p_visita_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.visite v
    WHERE v.id = p_visita_id
      AND v.organization_id = public.current_org_id()
  )
  AND (
    public.is_admin_or_planner()
    OR (public.is_attivo() AND (
          EXISTS (
            SELECT 1 FROM public.visite v
            WHERE v.id = p_visita_id AND v.specialist_id = auth.uid()
          )
       OR EXISTS (
            SELECT 1 FROM public.visite_pianificate vp
            WHERE vp.visita_id = p_visita_id AND vp.tecnico_assegnato_id = auth.uid()
          )
    ))
  );
$$;

-- ============================================================
-- 2. CHIUSURA LETTURE — org-gate sulla COLONNA organization_id della riga
-- Ogni tabella con colonna organization_id chiude l'org DIRETTAMENTE sulla propria
-- colonna nella policy SELECT (RETURNING-safe: la riga espone la propria colonna).
-- clienti/sedi/piani_visite qui + visite/vp/scadenze subito sotto. Le 5 foglie NON
-- hanno colonna organization_id → passano da can_read_visita (org-aware, Sezione 1).
-- ============================================================

-- CLIENTI — org sulla colonna + raggiungibilità (helper 025).
DROP POLICY IF EXISTS "clienti_select_scope" ON public.clienti;
CREATE POLICY "clienti_select_scope" ON public.clienti
  FOR SELECT USING (
    organization_id = public.current_org_id()
    AND public.can_access_cliente(id)
  );

-- SEDI — org sulla colonna + raggiungibilità (helper 025).
DROP POLICY IF EXISTS "sedi_select_scope" ON public.sedi;
CREATE POLICY "sedi_select_scope" ON public.sedi
  FOR SELECT USING (
    organization_id = public.current_org_id()
    AND public.can_access_sede(id)
  );

-- PIANI_VISITE — org sulla colonna + raggiungibilità sede (helper 025).
DROP POLICY IF EXISTS "piani_visite_select_scope" ON public.piani_visite;
CREATE POLICY "piani_visite_select_scope" ON public.piani_visite
  FOR SELECT USING (
    organization_id = public.current_org_id()
    AND public.can_access_sede(sede_id)
  );

-- VISITE — gate sulla colonna organization_id (RETURNING-safe, non rompe il fix 026).
DROP POLICY IF EXISTS "visite_select_scope" ON public.visite;
CREATE POLICY "visite_select_scope" ON public.visite
  FOR SELECT USING (
    organization_id = public.current_org_id()
    AND (
      public.is_admin_or_planner()
      OR (public.is_attivo() AND specialist_id = auth.uid())
      OR public.can_read_visita(id)
    )
  );

-- VISITE_PIANIFICATE (slot).
DROP POLICY IF EXISTS "vp_select_scope" ON public.visite_pianificate;
CREATE POLICY "vp_select_scope" ON public.visite_pianificate
  FOR SELECT USING (
    organization_id = public.current_org_id()
    AND (
      public.is_admin_or_planner()
      OR (public.is_attivo() AND (
           tecnico_assegnato_id = auth.uid()
        OR tecnico_assegnato_id IS NULL
        OR public.can_read_visita(visita_id)
      ))
    )
  );

-- SCADENZE.
DROP POLICY IF EXISTS "scadenze_select_scope" ON public.scadenze;
CREATE POLICY "scadenze_select_scope" ON public.scadenze
  FOR SELECT USING (
    organization_id = public.current_org_id()
    AND (
      public.is_admin_or_planner()
      OR (public.is_attivo() AND (
           (cliente_id IS NOT NULL AND public.can_access_cliente(cliente_id))
        OR (sede_id IS NOT NULL AND public.can_access_sede(sede_id))
      ))
    )
  );

-- ============================================================
-- 3. TABELLE FOGLIA — scrittura via can_write_visita() (STEP 19C.2)
-- can_write_visita() (034) è GIÀ org-safe: la visita deve essere in current_org_id()
-- E own_or_admin. Sostituisce il pattern EXISTS(...own_or_admin...) ripetuto.
-- Le SELECT foglia NON si toccano (già org-chiuse via can_read_visita, Sezione 1).
-- Su FOR UPDATE senza WITH CHECK, Postgres applica l'espressione USING anche alla
-- nuova riga → la nuova visita_id deve restare scrivibile (org-safe).
-- ============================================================

-- RISPOSTE (I/U da 002, D da 025).
DROP POLICY IF EXISTS "risposte_insert_via_visita" ON public.risposte;
CREATE POLICY "risposte_insert_via_visita" ON public.risposte
  FOR INSERT WITH CHECK (public.can_write_visita(visita_id));

DROP POLICY IF EXISTS "risposte_update_via_visita" ON public.risposte;
CREATE POLICY "risposte_update_via_visita" ON public.risposte
  FOR UPDATE USING (public.can_write_visita(visita_id));

DROP POLICY IF EXISTS "risposte_delete_via_visita" ON public.risposte;
CREATE POLICY "risposte_delete_via_visita" ON public.risposte
  FOR DELETE USING (public.can_write_visita(visita_id));

-- PUNTEGGI_SEZIONE (I/U/D da 025).
DROP POLICY IF EXISTS "punteggi_insert_via_visita" ON public.punteggi_sezione;
CREATE POLICY "punteggi_insert_via_visita" ON public.punteggi_sezione
  FOR INSERT WITH CHECK (public.can_write_visita(visita_id));

DROP POLICY IF EXISTS "punteggi_update_via_visita" ON public.punteggi_sezione;
CREATE POLICY "punteggi_update_via_visita" ON public.punteggi_sezione
  FOR UPDATE USING (public.can_write_visita(visita_id));

DROP POLICY IF EXISTS "punteggi_delete_via_visita" ON public.punteggi_sezione;
CREATE POLICY "punteggi_delete_via_visita" ON public.punteggi_sezione
  FOR DELETE USING (public.can_write_visita(visita_id));

-- VERBALI_PDF (I da 002, U/D da 025).
DROP POLICY IF EXISTS "verbali_insert_via_visita" ON public.verbali_pdf;
CREATE POLICY "verbali_insert_via_visita" ON public.verbali_pdf
  FOR INSERT WITH CHECK (public.can_write_visita(visita_id));

DROP POLICY IF EXISTS "verbali_update_via_visita" ON public.verbali_pdf;
CREATE POLICY "verbali_update_via_visita" ON public.verbali_pdf
  FOR UPDATE USING (public.can_write_visita(visita_id));

DROP POLICY IF EXISTS "verbali_delete_via_visita" ON public.verbali_pdf;
CREATE POLICY "verbali_delete_via_visita" ON public.verbali_pdf
  FOR DELETE USING (public.can_write_visita(visita_id));

-- IMPRESE_APPALTO (I/U/D da 025).
DROP POLICY IF EXISTS "imprese_appalto_insert_via_visita" ON public.imprese_appalto;
CREATE POLICY "imprese_appalto_insert_via_visita" ON public.imprese_appalto
  FOR INSERT WITH CHECK (public.can_write_visita(visita_id));

DROP POLICY IF EXISTS "imprese_appalto_update_via_visita" ON public.imprese_appalto;
CREATE POLICY "imprese_appalto_update_via_visita" ON public.imprese_appalto
  FOR UPDATE USING (public.can_write_visita(visita_id));

DROP POLICY IF EXISTS "imprese_appalto_delete_via_visita" ON public.imprese_appalto;
CREATE POLICY "imprese_appalto_delete_via_visita" ON public.imprese_appalto
  FOR DELETE USING (public.can_write_visita(visita_id));

-- RISPOSTE_IMPRESE_APPALTO (2-hop: impresa → visita).
DROP POLICY IF EXISTS "risposte_imprese_insert_via_visita" ON public.risposte_imprese_appalto;
CREATE POLICY "risposte_imprese_insert_via_visita" ON public.risposte_imprese_appalto
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.imprese_appalto ia
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND public.can_write_visita(ia.visita_id)
    )
  );

DROP POLICY IF EXISTS "risposte_imprese_update_via_visita" ON public.risposte_imprese_appalto;
CREATE POLICY "risposte_imprese_update_via_visita" ON public.risposte_imprese_appalto
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.imprese_appalto ia
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND public.can_write_visita(ia.visita_id)
    )
  );

DROP POLICY IF EXISTS "risposte_imprese_delete_via_visita" ON public.risposte_imprese_appalto;
CREATE POLICY "risposte_imprese_delete_via_visita" ON public.risposte_imprese_appalto
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.imprese_appalto ia
      WHERE ia.id = risposte_imprese_appalto.impresa_id
        AND public.can_write_visita(ia.visita_id)
    )
  );

-- ============================================================
-- 4. TABELLE DIRETTE — scrittura org-aware (STEP 19C.3 + scelte A e B)
-- A ogni policy INSERT/UPDATE/DELETE si AND-a `organization_id = current_org_id()`
-- (sulla riga NEW per WITH CHECK, sulla riga esistente per USING). Copre anche i
-- path tecnico/proprietario (scelta A) e le DELETE (scelta B).
-- NB (dipendenza): l'app oggi NON valorizza esplicitamente organization_id sugli
-- INSERT → si affida al DEFAULT (org di default, 19.A). Con UNA sola org, DEFAULT =
-- current_org_id() di ogni utente → gli INSERT passano il WITH CHECK. Onboarding di
-- una seconda org (Sprint 20) richiederà che l'app setti organization_id esplicito.
-- ============================================================

-- ── CLIENTI ────────────────────────────────────────────────
DROP POLICY IF EXISTS "clienti_insert_admin_planner" ON public.clienti;
CREATE POLICY "clienti_insert_admin_planner" ON public.clienti
  FOR INSERT WITH CHECK (
    public.is_admin_or_planner()
    AND organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "clienti_update_admin_planner" ON public.clienti;
CREATE POLICY "clienti_update_admin_planner" ON public.clienti
  FOR UPDATE
  USING (public.is_admin_or_planner() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin_or_planner() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS "clienti_delete_admin" ON public.clienti;
CREATE POLICY "clienti_delete_admin" ON public.clienti
  FOR DELETE USING (public.is_admin() AND organization_id = public.current_org_id());

-- ── SEDI ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "sedi_insert_admin_planner" ON public.sedi;
CREATE POLICY "sedi_insert_admin_planner" ON public.sedi
  FOR INSERT WITH CHECK (
    public.is_admin_or_planner()
    AND organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "sedi_update_admin_planner" ON public.sedi;
CREATE POLICY "sedi_update_admin_planner" ON public.sedi
  FOR UPDATE
  USING (public.is_admin_or_planner() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin_or_planner() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS "sedi_delete_admin" ON public.sedi;
CREATE POLICY "sedi_delete_admin" ON public.sedi
  FOR DELETE USING (public.is_admin() AND organization_id = public.current_org_id());

-- ── VISITE (scelta A: org-gate anche owner-path; + WITH CHECK su UPDATE) ────
DROP POLICY IF EXISTS "visite_insert_own_or_admin_planner" ON public.visite;
CREATE POLICY "visite_insert_own_or_admin_planner" ON public.visite
  FOR INSERT WITH CHECK (
    public.is_attivo()
    AND (specialist_id = auth.uid() OR public.is_admin_or_planner())
    AND organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "visite_update_own_or_admin" ON public.visite;
CREATE POLICY "visite_update_own_or_admin" ON public.visite
  FOR UPDATE
  USING (
    (specialist_id = auth.uid() OR public.is_admin())
    AND organization_id = public.current_org_id()
  )
  WITH CHECK (
    (specialist_id = auth.uid() OR public.is_admin())
    AND organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "visite_delete_own_or_admin" ON public.visite;
CREATE POLICY "visite_delete_own_or_admin" ON public.visite
  FOR DELETE USING (
    (specialist_id = auth.uid() OR public.is_admin())
    AND organization_id = public.current_org_id()
  );

-- ── VISITE_PIANIFICATE (scelta A: org-gate anche il path tecnico-aggancio) ──
DROP POLICY IF EXISTS "vp_insert_admin_planner" ON public.visite_pianificate;
CREATE POLICY "vp_insert_admin_planner" ON public.visite_pianificate
  FOR INSERT WITH CHECK (
    public.is_admin_or_planner()
    AND organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "vp_update_admin_planner" ON public.visite_pianificate;
CREATE POLICY "vp_update_admin_planner" ON public.visite_pianificate
  FOR UPDATE
  USING (public.is_admin_or_planner() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin_or_planner() AND organization_id = public.current_org_id());

-- Aggancio del tecnico (P6.1): org-gate su USING e WITH CHECK; anche la visita
-- agganciata deve essere della stessa org (difesa in profondità).
DROP POLICY IF EXISTS "vp_update_tecnico_aggancio" ON public.visite_pianificate;
CREATE POLICY "vp_update_tecnico_aggancio" ON public.visite_pianificate
  FOR UPDATE
  USING (
    public.is_attivo()
    AND organization_id = public.current_org_id()
    AND visita_id IS NULL
    AND stato <> 'eseguita'
    AND (tecnico_assegnato_id = auth.uid() OR tecnico_assegnato_id IS NULL)
  )
  WITH CHECK (
    public.is_attivo()
    AND organization_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.visite v
      WHERE v.id = visita_id
        AND v.specialist_id = auth.uid()
        AND v.organization_id = public.current_org_id()
    )
    AND (tecnico_assegnato_id = auth.uid() OR tecnico_assegnato_id IS NULL)
  );

-- vp_delete: unica policy della tabella ancora nella forma 021 (is_admin() puro —
-- 025 non l'ha ridefinita). Riceve l'org-gate come le altre DELETE (scelta B).
DROP POLICY IF EXISTS "vp_delete" ON public.visite_pianificate;
CREATE POLICY "vp_delete" ON public.visite_pianificate
  FOR DELETE USING (public.is_admin() AND organization_id = public.current_org_id());

-- ── PIANI_VISITE ───────────────────────────────────────────
DROP POLICY IF EXISTS "piani_visite_insert_admin_planner" ON public.piani_visite;
CREATE POLICY "piani_visite_insert_admin_planner" ON public.piani_visite
  FOR INSERT WITH CHECK (
    public.is_admin_or_planner()
    AND organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "piani_visite_update_admin_planner" ON public.piani_visite;
CREATE POLICY "piani_visite_update_admin_planner" ON public.piani_visite
  FOR UPDATE
  USING (public.is_admin_or_planner() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin_or_planner() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS "piani_visite_delete" ON public.piani_visite;
CREATE POLICY "piani_visite_delete" ON public.piani_visite
  FOR DELETE USING (public.is_admin() AND organization_id = public.current_org_id());

-- ── SCADENZE (SELECT già chiusa in Sezione 2) ──────────────
DROP POLICY IF EXISTS "scadenze_insert_admin_planner" ON public.scadenze;
CREATE POLICY "scadenze_insert_admin_planner" ON public.scadenze
  FOR INSERT WITH CHECK (
    public.is_admin_or_planner()
    AND organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "scadenze_update_admin_planner" ON public.scadenze;
CREATE POLICY "scadenze_update_admin_planner" ON public.scadenze
  FOR UPDATE
  USING (public.is_admin_or_planner() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_admin_or_planner() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS "scadenze_delete_admin" ON public.scadenze;
CREATE POLICY "scadenze_delete_admin" ON public.scadenze
  FOR DELETE USING (public.is_admin() AND organization_id = public.current_org_id());

-- ============================================================
-- 5. TRIGGER PER-ORG su organizzazione_membri (STEP 19C.4)
-- MIRROR dei trigger su `utenti` (025, 027) MA con invariante PER organization_id.
-- I trigger su `utenti` NON sono toccati: proteggono l'invariante globale legacy,
-- ancora in uso finché is_admin() resta globale.
-- ============================================================

-- 5.a — Anti-escalation (mirror di trg_utenti_anti_escalation, 025).
-- Un non-admin non può alterare ruolo/stato di una membership. ESENTE per service
-- role/postgres (auth.uid() IS NULL): è il canale legittimo del dual-write 19.B.
-- (Difesa in profondità: la tabella è comunque DENY-ALL per authenticated/anon.)
CREATE OR REPLACE FUNCTION public.trg_organizzazione_membri_anti_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND (NEW.ruolo IS DISTINCT FROM OLD.ruolo
          OR NEW.stato IS DISTINCT FROM OLD.stato)
  THEN
    RAISE EXCEPTION 'Modifica di ruolo/stato della membership non consentita: richiede privilegi admin.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizzazione_membri_anti_escalation ON public.organizzazione_membri;
CREATE TRIGGER trg_organizzazione_membri_anti_escalation
  BEFORE UPDATE ON public.organizzazione_membri
  FOR EACH ROW EXECUTE FUNCTION public.trg_organizzazione_membri_anti_escalation();

-- 5.b — Anti-lockout PER-ORG (mirror di trg_utenti_anti_lockout, 027).
-- Impedisce di rimuovere (DELETE o UPDATE che declassa/sospende) l'ULTIMO admin
-- attivo di UNA organization_id. SENZA esenzione service role (ultima rete, come 027).
--
-- ADVISORY LOCK DISTINTO da 81027: l'invariante qui è PER-ORG, non globale, quindi
-- è indipendente da quello di `utenti` (nessun motivo di condividere il lock —
-- condividerlo serializzerebbe inutilmente operazioni non correlate). Si usa la
-- forma a due argomenti pg_advisory_xact_lock(classid, objid): namespace fisso
-- 81035 (≠ 81027) + hash dell'organization_id, così due org diverse NON si
-- serializzano a vicenda. Eventuali collisioni di hashtext causano solo una
-- serializzazione in più (mai un errore): la correttezza non dipende dall'assenza
-- di collisioni. pg_catalog-qualified perché search_path=''.
-- NOTA plpgsql: su DELETE NEW è NULL → NEW referenziato SOLO nel ramo UPDATE.
CREATE OR REPLACE FUNCTION public.trg_organizzazione_membri_anti_lockout()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- OLD non era admin attivo della sua org → nessuna operazione può ridurre gli
  -- admin attivi di quell'org → passa senza lock né conteggio.
  IF NOT (OLD.ruolo = 'admin' AND OLD.stato = 'attivo') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Su UPDATE, se resta admin attivo NELLA STESSA org, non c'è rimozione.
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.ruolo = 'admin' AND NEW.stato = 'attivo'
        AND NEW.organization_id = OLD.organization_id) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Rimozione di un admin attivo dalla sua org: serializza PER-ORG e verifica che
  -- ne resti un altro con la stessa organization_id.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    81035, pg_catalog.hashtext(OLD.organization_id::text));

  IF NOT EXISTS (
    SELECT 1 FROM public.organizzazione_membri
    WHERE organization_id = OLD.organization_id
      AND ruolo = 'admin' AND stato = 'attivo'
      AND id <> OLD.id
  ) THEN
    RAISE EXCEPTION 'Deve rimanere almeno un admin attivo nell''organizzazione.'
      USING ERRCODE = 'SC001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizzazione_membri_anti_lockout ON public.organizzazione_membri;
CREATE TRIGGER trg_organizzazione_membri_anti_lockout
  BEFORE UPDATE OR DELETE ON public.organizzazione_membri
  FOR EACH ROW EXECUTE FUNCTION public.trg_organizzazione_membri_anti_lockout();

-- ============================================================
-- 6. organizzazione_membri resta DENY-ALL (STEP 19C.5)
-- Nessuna policy SELECT/INSERT/UPDATE/DELETE per authenticated/anon in questo
-- sprint. RLS già abilitata (034). Resta raggiungibile solo da SECURITY DEFINER
-- (current_org_id, can_write_visita) e da service-role (dual-write 19.B). Le policy
-- per-ruolo su questa tabella, se mai servissero, sono materia di uno sprint futuro.
-- ============================================================
