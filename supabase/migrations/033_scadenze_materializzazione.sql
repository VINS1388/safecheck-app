-- ============================================================
-- SafeCheck — Migration 033 (Sprint 18)
-- Adeguamento della tabella `scadenze` (dormiente dalla 018) per la
-- MATERIALIZZAZIONE delle scadenze calcolate dal motore checklist.
--
-- La tabella `scadenze` è una PROIEZIONE materializzata (stato corrente per
-- sede), NON un registro storico. La chiusura di un verbale (genera-pdf) ne
-- (ri)scrive le righe della propria sede+modulo, con riconciliazione (le
-- domande non più presenti nella chiusura corrente vengono eliminate).
--
-- SCELTE:
--   · Modello B latest-wins: chiave logica (sede_id, modulo_id, domanda_id).
--     `domanda_id` è la chiave logica della domanda (per la formazione
--     per-nominativo/lavoratore include il composite `D-03-0x::<id>`), stabile
--     tra verbali (preservata da clona_visita). `riferimento_id`=risposte.id e
--     `visita_id` restano come tracciabilità, non come chiave.
--   · SCOPING PER MODULO (previene il bug cross-modulo): la chiave e la
--     riconciliazione includono `modulo_id`, così la chiusura di un verbale
--     HACCP (0 domande flaggate) non tocca le righe sicurezza della stessa sede.
--   · Indice UNIQUE PARZIALE (WHERE riferimento_tipo='risposta_checklist') per
--     abilitare l'upsert e non collidere con le scadenze MANUALI future
--     (Sprint 13 NC tracking, domanda_id/modulo_id NULL).
--
-- Il writer è la funzione `materializza_scadenze` (SECURITY DEFINER,
-- search_path='', schema-qualificata), invocata via service role dalla route di
-- chiusura verbale, a valle del ricalcolo safety-net e della chiusura riuscita.
--
-- ADDITIVA. Non tocca dati esistenti (la tabella è vuota in prod).
-- ============================================================

-- ── Colonne di adeguamento ───────────────────────────────────
ALTER TABLE public.scadenze
  ADD COLUMN IF NOT EXISTS domanda_id text,
  ADD COLUMN IF NOT EXISTS visita_id  uuid REFERENCES public.visite(id),
  ADD COLUMN IF NOT EXISTS modulo_id  uuid REFERENCES public.moduli(id);

-- ── Indice UNIQUE parziale per l'upsert (solo righe materializzate) ──
-- Le scadenze manuali (riferimento_tipo <> 'risposta_checklist') restano fuori.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scadenze_materializzate
  ON public.scadenze (sede_id, modulo_id, domanda_id)
  WHERE riferimento_tipo = 'risposta_checklist';

-- ── Writer: materializza_scadenze (upsert latest-wins + riconciliazione) ─────
CREATE OR REPLACE FUNCTION public.materializza_scadenze(
  p_visita_id  uuid,
  p_sede_id    uuid,
  p_cliente_id uuid,
  p_modulo_id  uuid,
  p_rows       jsonb   -- [{domanda_id, riferimento_id, data_riferimento, periodicita_mesi, data_scadenza}]
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_upsert int;
BEGIN
  -- 1) Upsert (latest-wins) delle righe materializzate dalla chiusura corrente.
  INSERT INTO public.scadenze (
    tipo, cliente_id, sede_id, modulo_id, riferimento_tipo, riferimento_id,
    visita_id, domanda_id, data_riferimento, periodicita_mesi, data_scadenza, stato
  )
  SELECT
    'formazione', p_cliente_id, p_sede_id, p_modulo_id, 'risposta_checklist',
    (e->>'riferimento_id')::uuid, p_visita_id, e->>'domanda_id',
    (e->>'data_riferimento')::date, (e->>'periodicita_mesi')::int,
    (e->>'data_scadenza')::date, 'attiva'
  FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS e
  ON CONFLICT (sede_id, modulo_id, domanda_id) WHERE riferimento_tipo = 'risposta_checklist'
  DO UPDATE SET
    riferimento_id   = EXCLUDED.riferimento_id,
    visita_id        = EXCLUDED.visita_id,
    cliente_id       = EXCLUDED.cliente_id,
    data_riferimento = EXCLUDED.data_riferimento,
    periodicita_mesi = EXCLUDED.periodicita_mesi,
    data_scadenza    = EXCLUDED.data_scadenza,
    stato            = 'attiva',
    aggiornato_il    = now();

  GET DIAGNOSTICS v_upsert = ROW_COUNT;

  -- 2) Riconciliazione: elimina le righe STALE della stessa sede+modulo la cui
  --    domanda non è più nel set materializzato (es. nominativo/lavoratore
  --    rimosso). DELETE fisico: la tabella è proiezione, non registro storico.
  --    `<> ALL` gestisce anche il set VUOTO → chiusura senza domande flaggate
  --    (es. verbale HACCP) elimina solo le righe DI QUEL MODULO per la sede,
  --    lasciando INTATTE le righe di altri moduli (scoping cross-modulo).
  DELETE FROM public.scadenze s
  WHERE s.sede_id = p_sede_id
    AND s.modulo_id = p_modulo_id
    AND s.riferimento_tipo = 'risposta_checklist'
    AND s.domanda_id <> ALL (
      SELECT e->>'domanda_id' FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS e
    );

  RETURN v_upsert;
END;
$$;

-- La materializzazione è un'operazione di SISTEMA (service role), non un'azione
-- utente: si revoca l'esecuzione ai ruoli client e la si concede al solo
-- service_role (che invoca dalla route di chiusura). Impedisce a un utente di
-- forgiare righe scadenze scavalcando la RLS via RPC.
REVOKE ALL ON FUNCTION public.materializza_scadenze(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materializza_scadenze(uuid,uuid,uuid,uuid,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.materializza_scadenze(uuid,uuid,uuid,uuid,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.materializza_scadenze(uuid,uuid,uuid,uuid,jsonb) TO service_role;
