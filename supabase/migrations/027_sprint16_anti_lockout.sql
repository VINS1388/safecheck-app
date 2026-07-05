-- ============================================================
-- SafeCheck — Migration 027 (Sprint 16 · Checkpoint 2 — anti-lockout)
-- Rete di sicurezza a livello DB: impedisce di rimuovere l'ULTIMO admin
-- attivo dell'organizzazione, sia per DISATTIVAZIONE (attivo → false) sia per
-- RETROCESSIONE di ruolo (admin → altro).
--
-- DISTINTO dal trigger anti-escalation della 025 (trg_utenti_anti_escalation),
-- che resta INVARIATO. Le due reti hanno intento e regola di esenzione opposti:
--   · anti-escalation → ESENTE per service role/postgres (auth.uid() IS NULL):
--       protegge da un NON-admin che tenta di cambiare ruolo/attivo (proprio o
--       altrui). Il service role è il canale legittimo di gestione → esente.
--   · anti-lockout   → SENZA esenzione service role: NESSUN percorso — nemmeno
--       la server action /organizzazione (che opera via service role per la
--       Admin API di Supabase Auth), nemmeno postgres/superuser — può lasciare
--       l'organizzazione senza un admin attivo. È l'ULTIMA rete, sotto il check
--       applicativo nella server action (difesa in profondità).
--
-- RACE-SAFETY: due disattivazioni/retrocessioni CONCORRENTI di due admin
-- diversi, con esattamente 2 admin attivi, potrebbero superare entrambe il
-- check "ne resta almeno un altro" (ciascuna vede l'altro ancora attivo) e
-- azzerare gli admin. La sezione critica è quindi serializzata con un ADVISORY
-- LOCK di transazione a chiave fissa (81027): solo un'operazione che rimuove un
-- admin attivo può valutare il conteggio per volta; la seconda attende il commit
-- della prima e, in READ COMMITTED, la SELECT successiva vede il conteggio
-- aggiornato → viene bloccata. Nessun rischio di deadlock: il lock è a punto
-- singolo (chiave costante), non un lock incrociato sulle righe.
--
-- FIRE: BEFORE UPDATE OR DELETE FOR EACH ROW. Copre due modi di rimuovere
-- l'ultimo admin attivo: l'UPDATE che lo declassa/disattiva e la DELETE fisica
-- della sua riga. L'INSERT può solo AGGIUNGERE admin (mai ridurre l'ultimo),
-- quindi è fuori dal trigger. Sulla DELETE il trigger si limita al conteggio
-- anti-lockout: se lo consente, gli esiti FK (RESTRICT/CASCADE) seguono normali
-- e indipendenti — il trigger non li anticipa né li sostituisce.
-- NOTA plpgsql: su DELETE la riga NEW è NULL → NEW va referenziato SOLO nel
-- ramo TG_OP='UPDATE'.
--
-- IDEMPOTENTE (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). ADDITIVA sopra 025.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_utenti_anti_lockout()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Se OLD non era un admin attivo, nessuna operazione (UPDATE o DELETE) può
  -- ridurre il numero di admin attivi → passa senza controllo né lock.
  IF NOT (OLD.ruolo = 'admin' AND OLD.attivo = true) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- OLD ERA admin attivo. Su UPDATE, se resta admin attivo non c'è rimozione.
  -- (NEW referenziato SOLO qui: in DELETE è NULL.)
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.ruolo = 'admin' AND NEW.attivo = true) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Rimozione di un admin attivo: DELETE della sua riga, oppure UPDATE che la
  -- declassa/disattiva. Serializza (race-safety) e verifica che ne resti un altro.
  -- pg_catalog-qualified perché search_path=''.
  PERFORM pg_catalog.pg_advisory_xact_lock(81027);

  IF NOT EXISTS (
    SELECT 1 FROM public.utenti
    WHERE ruolo = 'admin' AND attivo = true AND id <> OLD.id
  ) THEN
    RAISE EXCEPTION 'Deve rimanere almeno un admin attivo nell''organizzazione.'
      USING ERRCODE = 'SC001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_utenti_anti_lockout ON public.utenti;
CREATE TRIGGER trg_utenti_anti_lockout
  BEFORE UPDATE OR DELETE ON public.utenti
  FOR EACH ROW EXECUTE FUNCTION public.trg_utenti_anti_lockout();
