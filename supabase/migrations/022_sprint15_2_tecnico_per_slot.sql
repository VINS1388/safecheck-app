-- ============================================================
-- SafeCheck — Migration 022
-- Sprint 15.2: assegnazione tecnico a livello SLOT + semantica esplicita
-- del collegamento visita↔slot.
--
-- CAMBIO ARCHITETTURALE (in vista di Sprint 16 RBAC):
--   L'assegnazione del tecnico scende dal PIANO al singolo SLOT. Il campo
--   piani_visite.tecnico_assegnato_id resta ma cambia significato: diventa
--   il DEFAULT ereditato dai nuovi slot alla generazione, non più
--   l'assegnazione effettiva. La visibilità RBAC di Sprint 16 filtrerà su
--   visite_pianificate.tecnico_assegnato_id (livello slot).
--
-- SEMANTICA COLLEGAMENTO VISITA↔SLOT (opzione A, decisa in sessione):
--   - visita_id        = "collegamento dichiarato" alla creazione visita;
--                        azzerato via FK ON DELETE SET NULL alla cancellazione
--                        della bozza.
--   - stato='eseguita' = "lavoro completato"; impostato SOLO alla chiusura
--                        del verbale.
--   - visita_id NOT NULL AND stato <> 'eseguita' = "in lavorazione"
--                        (stato derivato, nessun 4° valore enum — così il
--                        pattern di test BEGIN…ROLLBACK non è rotto da
--                        ALTER TYPE ... ADD VALUE).
--
-- PURAMENTE ADDITIVA sui dati (nuova colonna nullable + backfill dal piano);
-- CREATE OR REPLACE sulle 3 funzioni di generazione slot. Nessun impatto sui
-- 0 slot già agganciati in prod (verificato: 3 piani, 16 slot, 0 con visita_id).
-- Single-tenant, RLS invariata.
-- ============================================================

-- ── 1a. visite_pianificate: tecnico per-slot ────────────────────────────────
ALTER TABLE public.visite_pianificate
  ADD COLUMN IF NOT EXISTS tecnico_assegnato_id uuid REFERENCES public.utenti(id);

-- Backfill: ogni slot esistente eredita il tecnico del piano padre.
UPDATE public.visite_pianificate vp
SET tecnico_assegnato_id = pv.tecnico_assegnato_id
FROM public.piani_visite pv
WHERE vp.piano_id = pv.id
  AND vp.tecnico_assegnato_id IS DISTINCT FROM pv.tecnico_assegnato_id;

-- La colonna resta nullable: slot senza tecnico = "da assegnare" (stato legittimo).

-- Flag esplicito di personalizzazione: risolve l'ambiguità dell'inferenza per
-- confronto valori (uno slot col vecchio default non è "personalizzato"; uno
-- assegnato a mano alla stessa persona del default lo è). L'intento è dichiarato,
-- non dedotto.
ALTER TABLE public.visite_pianificate
  ADD COLUMN IF NOT EXISTS tecnico_personalizzato boolean NOT NULL DEFAULT false;

-- Backfill: gli slot esistenti seguivano tutti il default del piano (la feature
-- per-slot non esisteva) → false è corretto per costruzione. La DEFAULT false
-- copre già le righe esistenti; UPDATE esplicito per chiarezza e idempotenza.
UPDATE public.visite_pianificate SET tecnico_personalizzato = false
WHERE tecnico_personalizzato IS DISTINCT FROM false;

COMMENT ON COLUMN public.visite_pianificate.tecnico_personalizzato IS
  'true = tecnico assegnato esplicitamente dal planner sullo slot (non segue più '
  'il default del piano); false = eredita il default. Settato a true SOLO '
  'dall''azione di modifica per-slot in /pianificazione.';

-- Indice per le RLS di visibilità che Sprint 16 costruirà su questo campo.
CREATE INDEX IF NOT EXISTS idx_vp_tecnico
  ON public.visite_pianificate(tecnico_assegnato_id);

COMMENT ON COLUMN public.visite_pianificate.tecnico_assegnato_id IS
  'Tecnico assegnato a livello SLOT. Default ereditato dal piano alla generazione, '
  'poi personalizzabile dal planner. NULL = da assegnare. Campo su cui Sprint 16 RBAC '
  'filtrerà la visibilità delle visite.';

COMMENT ON COLUMN public.visite_pianificate.visita_id IS
  'Collegamento dichiarato alla creazione visita. Azzerato via FK ON DELETE SET NULL '
  'alla cancellazione della bozza. NOT NULL + stato<>''eseguita'' = in lavorazione.';

COMMENT ON COLUMN public.visite_pianificate.stato IS
  '''eseguita'' significa lavoro completato ed è impostato SOLO alla chiusura del '
  'verbale, mai alla creazione della visita.';

-- ── 1b. piani_visite: il tecnico diventa DEFAULT dei nuovi slot ──────────────
COMMENT ON COLUMN public.piani_visite.tecnico_assegnato_id IS
  'DEFAULT ereditato dai NUOVI slot alla generazione (Sprint 15.2). NON è più '
  'l''assegnazione effettiva: quella vive per-slot su '
  'visite_pianificate.tecnico_assegnato_id.';

-- ── 1c. genera_slot_ciclo: i nuovi slot ereditano il default del piano ───────
CREATE OR REPLACE FUNCTION public.genera_slot_ciclo(
  p_piano_id uuid,
  p_sede_id uuid,
  p_ciclo int,
  p_data_inizio date,
  p_visite_anno int,
  p_da_numero int DEFAULT 1
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_num int;
  v_offset int;
  v_count int := 0;
  v_tecnico uuid;
BEGIN
  IF p_visite_anno < 1 THEN
    RAISE EXCEPTION 'visite_anno deve essere >= 1 (ricevuto %)', p_visite_anno;
  END IF;

  -- Default corrente del piano: ogni nuovo slot lo eredita.
  SELECT tecnico_assegnato_id INTO v_tecnico
  FROM public.piani_visite WHERE id = p_piano_id;

  FOR v_num IN GREATEST(p_da_numero, 1) .. p_visite_anno LOOP
    v_offset := round((v_num - 1) * 12.0 / p_visite_anno)::int;
    INSERT INTO public.visite_pianificate (
      piano_id, sede_id, numero_visita, ciclo_numero, data_suggerita, stato,
      tecnico_assegnato_id, tecnico_personalizzato
    ) VALUES (
      p_piano_id, p_sede_id, v_num, p_ciclo,
      public.calcola_scadenza(p_data_inizio, v_offset),
      'da_pianificare',
      v_tecnico, false        -- nuovo slot: eredita il default, non personalizzato
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 1c. ricalcola_slot_ciclo: preserva SOLO gli slot personalizzati (flag) ────
-- Percorso di rigenerazione STRUTTURALE (cambio data/numero visite). Gli slot
-- 'eseguita' restano fuori dal DELETE (come già oggi). Per gli slot NON eseguiti
-- del ciclo si cattura, PRIMA del DELETE, (numero_visita, tecnico, data_pianificata,
-- tecnico_personalizzato); dopo la rigenerazione (default piano, data_suggerita,
-- stato 'da_pianificare', flag false) si ripristina, per numero_visita:
--   - se il predecessore aveva tecnico_personalizzato = true → si ripristinano
--     tecnico + flag true (l'assegnazione esplicita del planner sopravvive);
--   - se aveva false → si tiene il NUOVO default del piano (già impostato da
--     genera_slot_ciclo) con flag false (segue il default corrente);
--   - data_pianificata: se il predecessore l'aveva valorizzata → si ripristina
--     e lo stato torna 'pianificata' (correzione bug latente Sprint 15).
-- Slot senza predecessore (es. 2→4 visite: slot 3,4) → nuovo default, flag false.
-- Slot rimossi per riduzione (es. 4→2: slot 3,4) → personalizzazioni perse (atteso).
-- NB: il cambio di SOLO tecnico default NON passa da qui (sarebbe distruttivo per
-- le date): è gestito da un UPDATE mirato lato applicazione (salvaPiano).
CREATE OR REPLACE FUNCTION public.ricalcola_slot_ciclo(
  p_piano_id uuid,
  p_sede_id uuid,
  p_ciclo int,
  p_data_inizio date,
  p_visite_anno int
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_eseguiti int;
  v_gen int;
BEGIN
  -- Cattura le personalizzazioni degli slot NON eseguiti dello STESSO ciclo.
  DROP TABLE IF EXISTS _ricalcola_cap;
  CREATE TEMP TABLE _ricalcola_cap ON COMMIT DROP AS
  SELECT numero_visita, tecnico_assegnato_id, data_pianificata, tecnico_personalizzato
  FROM public.visite_pianificate
  WHERE piano_id = p_piano_id AND ciclo_numero = p_ciclo AND stato <> 'eseguita';

  DELETE FROM public.visite_pianificate
  WHERE piano_id = p_piano_id AND ciclo_numero = p_ciclo AND stato <> 'eseguita';

  SELECT count(*) INTO v_eseguiti
  FROM public.visite_pianificate
  WHERE piano_id = p_piano_id AND ciclo_numero = p_ciclo AND stato = 'eseguita';

  v_gen := public.genera_slot_ciclo(
    p_piano_id, p_sede_id, p_ciclo, p_data_inizio, p_visite_anno, v_eseguiti + 1
  );

  -- Ripristino per numero_visita (solo slot non eseguiti appena rigenerati).
  UPDATE public.visite_pianificate vp
  SET
    tecnico_assegnato_id = CASE
      WHEN cap.tecnico_personalizzato
      THEN cap.tecnico_assegnato_id        -- assegnazione esplicita: sopravvive
      ELSE vp.tecnico_assegnato_id          -- segue il nuovo default (già impostato da genera_slot_ciclo)
    END,
    tecnico_personalizzato = cap.tecnico_personalizzato,
    data_pianificata = cap.data_pianificata,
    stato = CASE
      WHEN cap.data_pianificata IS NOT NULL
      THEN 'pianificata'::public.stato_slot_pianificato
      ELSE vp.stato
    END
  FROM _ricalcola_cap cap
  WHERE vp.piano_id = p_piano_id
    AND vp.ciclo_numero = p_ciclo
    AND vp.numero_visita = cap.numero_visita
    AND vp.stato <> 'eseguita';

  RETURN v_gen;
END;
$$;

-- ── 1c. genera_prossimo_ciclo: invariata nel corpo ──────────────────────────
-- Chiama genera_slot_ciclo, che ora eredita il default del piano: i nuovi slot
-- del ciclo successivo (nessun predecessore) partono col tecnico default corrente
-- e flag false. Nessuna modifica necessaria — documentato qui per tracciabilità.
