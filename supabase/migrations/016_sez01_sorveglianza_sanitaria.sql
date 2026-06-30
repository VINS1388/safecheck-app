-- ============================================================
-- SafeCheck — Migration 016
-- Sprint 12.1: sotto-sezione condizionale "Sorveglianza sanitaria" in SEZ-01.
--
-- Aggiunge 3 domande di verifica gate-condizionate dalla domanda filtro
-- D-01-012 "Necessità di sorveglianza sanitaria":
--   - aperte se la filtro è C/PC/NC (sorveglianza necessaria);
--   - collassate se NA/NV (non poste, non richieste, non stampate).
--
-- Meccanismo gate a livello di DOMANDA (additivo, NON tocca il motore di
-- collasso di sezione di SEZ-08): ogni domanda gate ha `gated_by` (id della
-- filtro) e `gate_collassa_su` (valori che la nascondono). `ordine` frazionario
-- (4.1/4.2/4.3) per collocarle subito sotto la filtro (ordine 4) senza
-- rinumerare le domande esistenti.
--
-- D-01-016 ha `campo_data: true` (data ultimo sopralluogo del MC) — solo campo
-- dato, nessun calcolo scadenze (Sprint 13/14).
--
-- versione template_master: 5 → 6. Solo template: gli snapshot legacy (≤ v5)
-- non contengono queste domande → non appaiono, nessuna conversione.
-- ============================================================

WITH t AS (
  SELECT id, struttura_json FROM template_master WHERE attivo = true
),
new_sezioni AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN s->>'id' = 'SEZ-01' THEN
          jsonb_set(
            s,
            '{domande}',
            (s->'domande') || $q$[
              {
                "id": "D-01-014",
                "testo": "Tutti i lavoratori sottoposti a sorveglianza sanitaria sono in possesso di giudizio di idoneità rilasciato dal Medico Competente?",
                "ordine": 4.1,
                "obbligatoria": true,
                "tipo_risposta": "conformita_5",
                "correzione_default": "Acquisire dal Medico Competente i giudizi di idoneità mancanti per i lavoratori soggetti a sorveglianza sanitaria e conservarli agli atti, ai sensi dell'art. 41 c.6 D.Lgs. 81/2008.",
                "descrizione": "Verificare che per ogni lavoratore soggetto a sorveglianza sanitaria sia presente il giudizio di idoneità alla mansione espresso dal Medico Competente, ai sensi dell'art. 41 c.6 D.Lgs. 81/2008.",
                "rif_normativo": "Art. 41 c.6 D.Lgs. 81/2008",
                "gated_by": "D-01-012",
                "gate_collassa_su": ["NA", "NV"]
              },
              {
                "id": "D-01-015",
                "testo": "Il Medico Competente ha redatto e comunicato all'azienda il protocollo sanitario definito in funzione dei rischi specifici aziendali?",
                "ordine": 4.2,
                "obbligatoria": true,
                "tipo_risposta": "conformita_5",
                "correzione_default": "Richiedere al Medico Competente la redazione o l'aggiornamento del protocollo sanitario in funzione dei rischi specifici e acquisirne copia in azienda, ai sensi dell'art. 25 c.1 lett. b) D.Lgs. 81/2008.",
                "descrizione": "Verificare la presenza del protocollo sanitario predisposto dal Medico Competente sulla base della valutazione dei rischi, con indicazione degli accertamenti e della periodicità, ai sensi dell'art. 25 c.1 lett. b) D.Lgs. 81/2008.",
                "rif_normativo": "Art. 25 c.1 lett. b) D.Lgs. 81/2008",
                "gated_by": "D-01-012",
                "gate_collassa_su": ["NA", "NV"]
              },
              {
                "id": "D-01-016",
                "testo": "Il Medico Competente ha effettuato e verbalizzato il sopralluogo annuale negli ambienti di lavoro?",
                "ordine": 4.3,
                "obbligatoria": true,
                "tipo_risposta": "conformita_5",
                "correzione_default": "Programmare e verbalizzare il sopralluogo del Medico Competente negli ambienti di lavoro con cadenza almeno annuale, ai sensi dell'art. 25 c.1 lett. l) D.Lgs. 81/2008.",
                "descrizione": "Verificare l'avvenuto sopralluogo del Medico Competente negli ambienti di lavoro, con relativa verbalizzazione, almeno annuale o con la diversa periodicità concordata, ai sensi dell'art. 25 c.1 lett. l) D.Lgs. 81/2008. Indicare la data dell'ultimo sopralluogo.",
                "rif_normativo": "Art. 25 c.1 lett. l) D.Lgs. 81/2008",
                "gated_by": "D-01-012",
                "gate_collassa_su": ["NA", "NV"],
                "campo_data": true
              }
            ]$q$::jsonb
          )
        ELSE s
      END
      ORDER BY (s->>'ordine')::int
    ) AS sezioni
  FROM t, jsonb_array_elements(t.struttura_json->'sezioni') AS s
  GROUP BY t.id
)
UPDATE template_master tm
SET
  struttura_json = jsonb_set(
    jsonb_set(tm.struttura_json, '{sezioni}', ns.sezioni),
    '{versione}', '6'::jsonb
  ),
  versione = 6
FROM new_sezioni ns
WHERE tm.id = ns.id;
