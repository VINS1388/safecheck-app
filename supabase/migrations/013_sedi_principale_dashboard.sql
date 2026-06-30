-- ============================================================
-- SafeCheck — Migration 013
-- Sprint 10: marker "sede principale" + aggregati dashboard.
--
-- Verifica schema (Step 0): la sede legale vive già su `clienti` (P.IVA,
-- indirizzo_sede_legale, ecc.), la tabella `sedi` operative esiste già, e
-- `visite.sede_id` è già FK → nessuna estensione anagrafica né migrazione
-- dati. L'unica cosa mancante per le sedi operative è il marker "principale"
-- (preselezione/ordinamento di default). Niente nuovi indici: gli aggregati
-- usano gli indici già presenti (idx_visite_cliente, idx_visite_stato,
-- idx_sedi_cliente).
--
-- Decisioni Sprint 10 (confermate):
--   - sedi.principale (boolean, default false), unicità per cliente gestita
--     a livello applicativo (impostaSedePrincipale azzera le altre);
--   - eliminazione sede = soft-delete (attiva=false), bloccata se ci sono
--     visite collegate (controllo applicativo).
-- ============================================================

-- ── Marker sede principale ────────────────────────────────────────────────
ALTER TABLE sedi
  ADD COLUMN IF NOT EXISTS principale boolean NOT NULL DEFAULT false;

-- ── Aggregati dashboard (SECURITY INVOKER: la RLS del chiamante si applica) ─
-- NB: nessun `SET search_path` su queste funzioni. Sono SECURITY INVOKER e la
-- valutazione delle policy RLS richiede di risolvere `is_admin()` (non
-- schema-qualificata nelle policy della migration 002): forzare search_path=''
-- la renderebbe irrisolvibile. I riferimenti nel corpo sono comunque
-- schema-qualificati (public.*).

CREATE OR REPLACE FUNCTION dashboard_kpi()
RETURNS TABLE (
  clienti_attivi bigint,
  verbali_totali bigint,
  nc_verbali_chiusi bigint,
  ultimo_sopralluogo date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    (SELECT count(*) FROM public.clienti WHERE attivo = true),
    (SELECT count(*) FROM public.visite),
    (
      (SELECT count(*) FROM public.risposte r
         JOIN public.visite v ON v.id = r.visita_id
        WHERE v.stato_verbale = 'chiuso' AND r.valore = 'NC')
      +
      (SELECT count(*) FROM public.risposte_imprese_appalto ria
         JOIN public.imprese_appalto ia ON ia.id = ria.impresa_id
         JOIN public.visite v ON v.id = ia.visita_id
        WHERE v.stato_verbale = 'chiuso' AND ria.esito = 'NC')
    ),
    (SELECT max(data_visita) FROM public.visite);
$$;

CREATE OR REPLACE FUNCTION dashboard_clienti()
RETURNS TABLE (
  id uuid,
  ragione_sociale text,
  citta text,
  n_sedi bigint,
  n_verbali bigint,
  ultima_visita date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    c.id,
    c.ragione_sociale,
    c.citta,
    count(DISTINCT s.id) FILTER (WHERE s.attiva),
    count(DISTINCT v.id),
    max(v.data_visita)
  FROM public.clienti c
  LEFT JOIN public.sedi s ON s.cliente_id = c.id
  LEFT JOIN public.visite v ON v.cliente_id = c.id
  WHERE c.attivo = true
  GROUP BY c.id, c.ragione_sociale, c.citta
  ORDER BY c.ragione_sociale;
$$;
