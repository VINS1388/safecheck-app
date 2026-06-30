-- ============================================================
-- SafeCheck — Migration 011
-- Sprint 9: nuova sezione SEZ-08 "Appalti e contratti d'opera (Art. 26)"
-- con la PRIMA logica condizionale a livello di SEZIONE.
--
--   - 9 domande (D-08-001..D-08-009); totale template 55 + 9 = 64.
--   - domanda_filtro = D-08-001: se risposta NA (nessun appalto presente),
--     le altre 8 domande sono nascoste e non richieste per la completezza.
--   - D-08-003 ha un campo_extra "testo_libero" (elenco imprese/referenti),
--     persistito su risposte.osservazione_evidenza (nessuna modifica di schema).
--   - versione template_master: 2 -> 3.
--
-- IMMUTABILITÀ: si aggiorna SOLO template_master (fonte per nuove visite).
-- Gli snapshot delle visite già create restano congelati e NON vengono toccati.
--
-- Append in coda all'array sezioni (ordine 8) tramite operatore jsonb `||`.
-- JSON in dollar-quoting ($sez$...$sez$) per preservare gli apostrofi.
-- ============================================================

UPDATE template_master
SET
  struttura_json =
    jsonb_set(
      jsonb_set(struttura_json, '{versione}', '3'::jsonb),
      '{sezioni}',
      (struttura_json->'sezioni') || $sez$[
        {
          "id": "SEZ-08",
          "nome": "Appalti e contratti d'opera (Art. 26)",
          "descrizione": "Gestione dei rischi da interferenza in presenza di appalti, contratti d'opera o di somministrazione presso la sede.",
          "ordine": 8,
          "domanda_filtro": "D-08-001",
          "domande": [
            {
              "id": "D-08-001",
              "testo": "Presenza di appalti, contratti d'opera o di somministrazione",
              "ordine": 1,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Censire i contratti di appalto, d'opera e di somministrazione presenti presso la sede e gestire i relativi rischi da interferenza ai sensi dell'art. 26 D.Lgs. 81/2008.",
              "descrizione": "Verificare se presso la sede sono in corso contratti di appalto, contratti d'opera o contratti di somministrazione con imprese o lavoratori autonomi esterni, ai sensi dell'art. 26 D.Lgs. 81/2008. Se non presenti, selezionare NA: la sezione si chiude qui.",
              "rif_normativo": "Art. 26 D.Lgs. 81/2008",
              "nota_ui": "Se NA, le domande successive non sono richieste."
            },
            {
              "id": "D-08-002",
              "testo": "Verifica idoneità tecnico-professionale (ITP) delle imprese appaltatrici",
              "ordine": 2,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Acquisire, per ciascuna impresa appaltatrice e lavoratore autonomo, il certificato di iscrizione alla CCIAA e l'autocertificazione del possesso dei requisiti di idoneità tecnico-professionale ai sensi dell'art. 26 c.1 lett. a); conservarne copia agli atti dell'appalto.",
              "descrizione": "Verificare che sia stata effettuata la verifica dell'idoneità tecnico-professionale delle imprese appaltatrici e dei lavoratori autonomi, mediante acquisizione del certificato di iscrizione alla Camera di Commercio (CCIAA) e dell'autocertificazione del possesso dei requisiti di idoneità tecnico-professionale, ai sensi dell'art. 26 comma 1 lett. a) D.Lgs. 81/2008.",
              "rif_normativo": "Art. 26 c.1 lett. a) D.Lgs. 81/2008"
            },
            {
              "id": "D-08-003",
              "testo": "Identificazione delle imprese appaltatrici/subappaltatrici",
              "ordine": 3,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Predisporre e tenere aggiornato l'elenco delle imprese appaltatrici/subappaltatrici e dei lavoratori autonomi presenti presso la sede, con ragione sociale, attività affidata e referente; aggiornarlo a ogni variazione.",
              "descrizione": "Verificare la disponibilità dell'elenco aggiornato delle imprese e dei lavoratori autonomi presenti presso la sede in regime di appalto, con relativa ragione sociale e referente.",
              "rif_normativo": "Art. 26 D.Lgs. 81/2008",
              "campo_extra": {
                "tipo": "testo_libero",
                "label": "Imprese presenti (ragione sociale e referente)",
                "multiplo": false
              }
            },
            {
              "id": "D-08-004",
              "testo": "Informazione sui rischi specifici dell'ambiente di lavoro",
              "ordine": 4,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Fornire formalmente alle imprese appaltatrici l'informativa sui rischi specifici dell'ambiente di lavoro e sulle misure di prevenzione ed emergenza adottate ai sensi dell'art. 26 c.1 lett. b), acquisendone evidenza di consegna.",
              "descrizione": "Verificare che il datore di lavoro committente abbia fornito alle imprese appaltatrici dettagliate informazioni sui rischi specifici esistenti nell'ambiente in cui sono destinate a operare e sulle misure di prevenzione e emergenza adottate, ai sensi dell'art. 26 comma 1 lett. b) D.Lgs. 81/2008.",
              "rif_normativo": "Art. 26 c.1 lett. b) D.Lgs. 81/2008"
            },
            {
              "id": "D-08-005",
              "testo": "Necessità del Documento Unico di Valutazione dei Rischi da Interferenze (DUVRI)",
              "ordine": 5,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Valutare e documentare la sussistenza di rischi da interferenza; ove presenti, dare atto dell'obbligo di redazione del DUVRI ai sensi dell'art. 26 c.3, escludendo i rischi specifici propri dell'attività delle imprese appaltatrici.",
              "descrizione": "Valutare se sussiste l'obbligo di redigere il DUVRI in relazione alla presenza di rischi da interferenza tra le attività del committente e quelle dell'appaltatore, ai sensi dell'art. 26 comma 3 D.Lgs. 81/2008. Non è richiesto per i rischi specifici propri dell'attività delle imprese appaltatrici.",
              "rif_normativo": "Art. 26 c.3 D.Lgs. 81/2008"
            },
            {
              "id": "D-08-006",
              "testo": "Presenza e contenuto del DUVRI",
              "ordine": 6,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Redigere o completare il DUVRI in coerenza con i rischi da interferenza individuati e allegarlo al contratto di appalto/opera ai sensi dell'art. 26 c.3; aggiornarlo in caso di modifiche.",
              "descrizione": "Verificare la presenza del DUVRI, la sua completezza rispetto ai rischi da interferenza identificati, e l'allegazione al contratto di appalto o d'opera, ai sensi dell'art. 26 comma 3 D.Lgs. 81/2008.",
              "rif_normativo": "Art. 26 c.3 D.Lgs. 81/2008"
            },
            {
              "id": "D-08-007",
              "testo": "Costi della sicurezza da interferenza",
              "ordine": 7,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Indicare specificamente nel contratto di appalto i costi della sicurezza relativi ai rischi da interferenza, non soggetti a ribasso d'asta, ai sensi dell'art. 26 c.5.",
              "descrizione": "Verificare l'indicazione specifica dei costi relativi alla sicurezza del lavoro nel contratto di appalto, distinti da quelli soggetti a ribasso d'asta, ai sensi dell'art. 26 comma 5 D.Lgs. 81/2008.",
              "rif_normativo": "Art. 26 c.5 D.Lgs. 81/2008"
            },
            {
              "id": "D-08-008",
              "testo": "Cooperazione e coordinamento tra datore di lavoro e appaltatori",
              "ordine": 8,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Attuare e verbalizzare la cooperazione e il coordinamento tra committente e appaltatori nell'attuazione delle misure di prevenzione e protezione ai sensi dell'art. 26 c.2 (es. riunioni di coordinamento, verbali, sopralluoghi congiunti).",
              "descrizione": "Verificare l'effettiva cooperazione tra il datore di lavoro committente e gli appaltatori nell'attuazione delle misure di prevenzione e protezione, nonché il coordinamento degli interventi di prevenzione e protezione dai rischi, ai sensi dell'art. 26 comma 2 D.Lgs. 81/2008.",
              "rif_normativo": "Art. 26 c.2 D.Lgs. 81/2008"
            },
            {
              "id": "D-08-009",
              "testo": "Tesserini di riconoscimento del personale esterno",
              "ordine": 9,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Dotare il personale delle imprese appaltatrici e i lavoratori autonomi di tessera di riconoscimento corredata di fotografia, generalità del lavoratore e indicazione del datore di lavoro ai sensi dell'art. 26 c.8.",
              "descrizione": "Verificare che il personale delle imprese appaltatrici e dei lavoratori autonomi sia munito di apposita tessera di riconoscimento corredata di fotografia, generalità del lavoratore e indicazione del datore di lavoro, ai sensi dell'art. 26 comma 8 D.Lgs. 81/2008.",
              "rif_normativo": "Art. 26 c.8 D.Lgs. 81/2008"
            }
          ]
        }
      ]$sez$::jsonb
    ),
  versione = 3
WHERE attivo = true;
