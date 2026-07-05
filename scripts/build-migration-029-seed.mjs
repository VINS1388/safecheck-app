/**
 * Generatore di supabase/migrations/029_haccp_generico_template.sql (Sprint HACCP 2).
 *
 * Inietta il contenuto BYTE-FEDELE di seed/template-haccp-generico-v1.0.json
 * dentro il seed di template_master, usando dollar-quoting $haccp_json$.
 *
 * Condizioni vincolanti (autorizzazione Vincenzo, Fase A opzione A):
 *  (1) assert programmatico dell'ASSENZA del tag $haccp_json$ nel JSON canonico
 *      PRIMA di iniettarlo (altrimenti il dollar-quoting si romperebbe).
 *  (2) il file generato È quello applicato in prod e committato: si genera UNA
 *      volta, non si rigenera dopo l'apply.
 *  (3) GRANT/REVOKE su can_creare_visita_con_modulo coerenti con la 025
 *      (EXECUTE a authenticated, revoca PUBLIC).
 * Opzione A: UNIQUE(versione) → UNIQUE(modulo_id, versione), nome constraint
 *      ricavato dal catalogo (nessun placeholder).
 *
 * Uso: node scripts/build-migration-029-seed.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_FILE = join(ROOT, "seed", "template-haccp-generico-v1.0.json");
const OUT_FILE = join(ROOT, "supabase", "migrations", "029_haccp_generico_template.sql");
const TAG = "haccp_json";

const raw = readFileSync(JSON_FILE, "utf8");

// (1) Assenza del tag dollar-quoting nel contenuto canonico.
if (raw.includes(`$${TAG}$`)) {
  throw new Error(
    `Il JSON canonico contiene il tag di dollar-quoting $${TAG}$: iniezione non sicura. Interrotto.`
  );
}
// Sanity: dev'essere JSON valido e avere la forma attesa (8 sezioni / 46 domande).
const parsed = JSON.parse(raw);
const sezioni = parsed.sezioni ?? [];
const totDomande = sezioni.reduce((n, s) => n + (s.domande?.length ?? 0), 0);
if (sezioni.length !== 8 || totDomande !== 46) {
  throw new Error(`Forma inattesa: ${sezioni.length} sezioni, ${totDomande} domande (attese 8 / 46). Interrotto.`);
}
if (parsed.tipo_scoring !== "haccp_media_sezione" || parsed.modulo !== "haccp_generico") {
  throw new Error(`Marker inattesi: modulo=${parsed.modulo} tipo_scoring=${parsed.tipo_scoring}. Interrotto.`);
}

const SQL = `-- ============================================================
-- SafeCheck — Migration 029 (Sprint HACCP 2 · primo verbale HACCP vendibile)
-- GENERATO da scripts/build-migration-029-seed.mjs — NON modificare a mano.
--   Il blocco struttura_json è il contenuto byte-fedele di
--   seed/template-haccp-generico-v1.0.json iniettato via dollar-quoting.
--
-- Unità logica unica:
--   1. Rimozione DEFAULT 'sicurezza' da modulo_id (modulo SEMPRE esplicito)
--   2. Helper can_creare_visita_con_modulo() + GRANT EXECUTE authenticated
--   3. UNIQUE(versione) -> UNIQUE(modulo_id, versione) (nome constraint dal catalogo)
--   4. Attivazione a catalogo di haccp_generico (retail/collettiva restano spenti)
--   5. Seed template_master HACCP generico v1.0 (versione 1, attivo)
--
-- ADDITIVA sopra 028. Idempotente dove possibile.
-- Helper RLS riusati (025): pattern SECURITY DEFINER STABLE search_path=''.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RIMOZIONE DEFAULT — un INSERT senza modulo_id ora FALLISCE (NOT NULL).
--    NOT NULL e FK verso moduli(id) restano invariati.
-- ------------------------------------------------------------
ALTER TABLE public.visite          ALTER COLUMN modulo_id DROP DEFAULT;
ALTER TABLE public.piani_visite    ALTER COLUMN modulo_id DROP DEFAULT;
ALTER TABLE public.template_master ALTER COLUMN modulo_id DROP DEFAULT;

-- ------------------------------------------------------------
-- 2. HELPER can_creare_visita_con_modulo(sede, modulo) -> boolean
--    SECURITY DEFINER motivato: deve leggere moduli_sede anche quando la sede
--    non è ancora raggiungibile via RLS dal tecnico alla PRIMA visita (caso
--    emerso in HACCP 1). STABLE, search_path='', pattern helper 025.
--    Verifica: modulo attivo a catalogo AND attivo sulla sede.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_creare_visita_con_modulo(
  p_sede_id uuid,
  p_modulo_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.moduli m
    JOIN public.moduli_sede ms ON ms.modulo_id = m.id
    WHERE m.id       = p_modulo_id
      AND ms.sede_id = p_sede_id
      AND m.attivo   = true
      AND ms.attivo  = true
  );
$fn$;

REVOKE ALL ON FUNCTION public.can_creare_visita_con_modulo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_creare_visita_con_modulo(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 3. UNIQUE(versione) -> UNIQUE(modulo_id, versione)
--    Con un secondo modulo il namespace globale di 'versione' è errato: due
--    template di moduli diversi possono legittimamente avere la stessa versione.
--    DROP robusto: individua QUALUNQUE UNIQUE sulle sole {versione} (nome inline
--    auto-generato dalla 001, tipicamente template_master_versione_key) dal
--    catalogo, senza placeholder. ADD idempotente.
-- ------------------------------------------------------------
DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'template_master' AND con.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(con.conkey) AS k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
      ) = ARRAY['versione']
  LOOP
    EXECUTE format('ALTER TABLE public.template_master DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'template_master'
      AND con.conname = 'template_master_modulo_versione_key'
  ) THEN
    ALTER TABLE public.template_master
      ADD CONSTRAINT template_master_modulo_versione_key UNIQUE (modulo_id, versione);
  END IF;
END $mig$;

-- ------------------------------------------------------------
-- 4. ATTIVAZIONE CATALOGO — SOLO haccp_generico. retail/collettiva invariati
--    (attivo=false); sicurezza invariato.
-- ------------------------------------------------------------
UPDATE public.moduli SET attivo = true WHERE codice = 'haccp_generico';

-- ------------------------------------------------------------
-- 5. SEED TEMPLATE MASTER HACCP generico v1.0
--    modulo_id = haccp_generico; versione 1; attivo. tipo_scoring vive DENTRO
--    struttura_json (nessuna colonna tipo_scoring esiste: coerente con come il
--    template 'sicurezza' non ha colonna scoring). UUID fisso deterministico.
--    REGOLA PERMANENTE: ogni futura migration su template_master filtra SEMPRE
--    anche per modulo_id, mai solo WHERE attivo=true (ora esistono 2 righe attive).
-- ------------------------------------------------------------
INSERT INTO public.template_master (id, nome, descrizione, versione, struttura_json, attivo, modulo_id)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'Template HACCP generico',
  'Template HACCP generico, versione contenuto 1.0 — autocontrollo alimentare.',
  1,
  $${TAG}$${raw}$${TAG}$::jsonb,
  true,
  'a0000000-0000-4000-8000-000000000002'  -- haccp_generico
)
ON CONFLICT (id) DO UPDATE
  SET struttura_json = EXCLUDED.struttura_json,
      nome           = EXCLUDED.nome,
      descrizione    = EXCLUDED.descrizione,
      versione       = EXCLUDED.versione,
      attivo         = EXCLUDED.attivo,
      modulo_id      = EXCLUDED.modulo_id;
`;

writeFileSync(OUT_FILE, SQL, "utf8");
console.log(`✓ Generato ${OUT_FILE}`);
console.log(`  JSON canonico: ${sezioni.length} sezioni, ${totDomande} domande, tag $${TAG}$ assente.`);
