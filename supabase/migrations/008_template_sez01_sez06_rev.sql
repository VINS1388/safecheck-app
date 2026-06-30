-- ============================================================
-- SafeCheck — Migration 008
-- Sprint 7-FIX (FASE 3): riscrittura contenuto SEZ-01 e SEZ-06 del
-- template_master attivo per allinearlo ai riferimenti normativi reali.
--
--   SEZ-01: da 11 a 13 domande
--     - testi riscritti: DL, RLS, Preposti, Dirigenti
--     - nuove domande: "Necessità di sorveglianza sanitaria" (prima del MC),
--       "Comunicazione nominativo RLS al portale INAIL" (dopo il RLS)
--   SEZ-06: da 5 a 6 domande
--     - "impianto di messa a terra" sdoppiata in: denuncia (5a) e
--       verifica periodica (5b)
--
-- IMMUTABILITÀ: si aggiorna SOLO il template_master (fonte per nuove
-- visite). Gli snapshot delle visite già create restano congelati e NON
-- vengono toccati (es. SC-2026-0003 mantiene 11 domande in SEZ-01).
--
-- Aggiornamento chirurgico via jsonb_set: sezioni[0] = SEZ-01, sezioni[5]
-- = SEZ-06 (ordine sezioni invariato SEZ-01..SEZ-07).
-- ============================================================

UPDATE template_master
SET
  struttura_json =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(struttura_json, '{versione}', '2'::jsonb),
          '{origine,versione_prototipo}', '"1.0.4"'::jsonb
        ),
        '{sezioni,0}',
        '{
          "id": "SEZ-01",
          "nome": "Organizzazione della sicurezza",
          "descrizione": "Struttura organizzativa della sicurezza: nomine, deleghe, organigramma.",
          "ordine": 1,
          "domande": [
            {
              "id": "D-01-009",
              "testo": "Individuazione del Datore di Lavoro",
              "ordine": 1,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "",
              "note_tecnico": "Verificare l''individuazione del Datore di Lavoro ai sensi dell''art. 2 D.Lgs. 81/2008 e la presenza delle relative deleghe di funzioni ai sensi dell''art. 16, ove conferite.",
              "rif_normativo": "Art. 2 e art. 16 D.Lgs. 81/2008",
              "campo_extra": { "tipo": "nominativo", "label": "DL", "multiplo": false }
            },
            {
              "id": "D-01-001",
              "testo": "È presente e documentato l''atto di nomina del Responsabile del Servizio di Prevenzione e Protezione (RSPP)?",
              "ordine": 2,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Predisporre atto formale di nomina del RSPP firmato dal datore di lavoro, con accettazione dell''incarico da parte del nominato.",
              "note_tecnico": "Verificare che la nomina sia sottoscritta dal datore di lavoro e accettata dal nominato (art. 32).",
              "campo_extra": { "tipo": "nominativo", "label": "RSPP", "multiplo": false }
            },
            {
              "id": "D-01-003",
              "testo": "Sono presenti e documentate le nomine degli Addetti al Servizio di Prevenzione e Protezione (ASPP), ove previsti?",
              "ordine": 3,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Valutare la necessita'' di ASPP in base alle dimensioni e alla tipologia di rischio. In caso di necessita'', predisporre atti di nomina e verificare i requisiti formativi degli addetti.",
              "note_tecnico": "Gli ASPP sono obbligatori solo in alcune tipologie/dimensioni aziendali.",
              "campo_extra": { "tipo": "nominativo", "label": "ASPP", "multiplo": true }
            },
            {
              "id": "D-01-012",
              "testo": "Necessità di sorveglianza sanitaria",
              "ordine": 4,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "",
              "note_tecnico": "Verificare se dalla valutazione dei rischi (DVR) emerge l''obbligo di sottoporre i lavoratori a sorveglianza sanitaria ai sensi dell''art. 41 D.Lgs. 81/2008.",
              "rif_normativo": "Art. 41 D.Lgs. 81/2008"
            },
            {
              "id": "D-01-002",
              "testo": "È presente e documentato l''atto di nomina del Medico Competente (ove previsto dalla valutazione del rischio)?",
              "ordine": 5,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Verificare se la valutazione del rischio prevede l''obbligo di sorveglianza sanitaria. In caso affermativo, procedere alla nomina del Medico Competente con atto formale.",
              "note_tecnico": "Obbligatoria solo se il DVR prevede sorveglianza sanitaria. Non richiedere se non prevista.",
              "campo_extra": { "tipo": "nominativo", "label": "MC", "multiplo": true }
            },
            {
              "id": "D-01-006",
              "testo": "Documentazione elezione o designazione RLS",
              "ordine": 6,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Verificare se vi sono le condizioni per l''elezione del RLS. In assenza di elezione, registrare il fatto e verificare l''eventuale obbligo di comunicazione all''INAIL tramite il sistema RLST territoriale.",
              "note_tecnico": "Verificare la presenza della documentazione relativa all''elezione o designazione del Rappresentante dei Lavoratori per la Sicurezza ai sensi degli artt. 47-48 D.Lgs. 81/2008.",
              "rif_normativo": "Artt. 47-48 D.Lgs. 81/2008",
              "campo_extra": { "tipo": "nominativo", "label": "RLS", "multiplo": true }
            },
            {
              "id": "D-01-013",
              "testo": "Comunicazione nominativo RLS al portale INAIL",
              "ordine": 7,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "",
              "note_tecnico": "Verificare l''avvenuto invio del nominativo del Rappresentante dei Lavoratori per la Sicurezza tramite il portale telematico INAIL, come previsto dalla normativa vigente.",
              "rif_normativo": "Art. 18 c.1 lett. aa D.Lgs. 81/2008"
            },
            {
              "id": "D-01-004",
              "testo": "Sono presenti e documentate le nomine degli Addetti Antincendio e delle loro qualifiche?",
              "ordine": 8,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Procedere alla nomina formale degli addetti antincendio e verificare che abbiano completato la formazione specifica richiesta in base al livello di rischio incendio del luogo di lavoro.",
              "note_tecnico": "Verificare il livello di rischio incendio che determina il monte ore di formazione.",
              "campo_extra": { "tipo": "nominativo", "label": "Addetti antincendio", "multiplo": true }
            },
            {
              "id": "D-01-005",
              "testo": "Sono presenti e documentate le nomine degli Addetti al Primo Soccorso?",
              "ordine": 9,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Nominare formalmente gli addetti al primo soccorso e verificare che abbiano completato il corso di formazione specifico secondo il gruppo di appartenenza dell''azienda (A, B o C ai sensi del D.M. 388/2003).",
              "note_tecnico": "Gruppo A/B/C determina durata e contenuto formazione. Aggiornamento ogni 3 anni.",
              "campo_extra": { "tipo": "nominativo", "label": "Addetti primo soccorso", "multiplo": true }
            },
            {
              "id": "D-01-010",
              "testo": "Lettere di incarico Preposti",
              "ordine": 10,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "",
              "note_tecnico": "Verificare l''individuazione e la formalizzazione dell''incarico dei preposti, anche di fatto, ai sensi dell''art. 19 e dell''art. 18 comma 1 lett. b-bis D.Lgs. 81/2008.",
              "rif_normativo": "Art. 19 e art. 18 c.1 lett. b-bis D.Lgs. 81/2008",
              "campo_extra": { "tipo": "nominativo", "label": "Preposti", "multiplo": true }
            },
            {
              "id": "D-01-011",
              "testo": "Deleghe di funzioni ai Dirigenti",
              "ordine": 11,
              "obbligatoria": true,
              "tipo_risposta": "conformita_5",
              "correzione_default": "",
              "note_tecnico": "Verificare la presenza di deleghe di funzioni in materia di sicurezza conferite ai dirigenti con poteri gerarchici e funzionali, ai sensi dell''art. 16 D.Lgs. 81/2008, ove presenti.",
              "rif_normativo": "Art. 16 D.Lgs. 81/2008",
              "campo_extra": { "tipo": "nominativo", "label": "Dirigenti", "multiplo": true }
            },
            {
              "id": "D-01-007",
              "testo": "Sono presenti aggiornamenti o revisioni delle nomine a seguito di variazioni organizzative rilevanti?",
              "ordine": 12,
              "obbligatoria": false,
              "tipo_risposta": "conformita_5",
              "correzione_default": "A ogni variazione organizzativa significativa (cambio RSPP, cambio MC, variazione numero addetti, apertura nuova sede), procedere alla revisione e aggiornamento degli atti di nomina.",
              "note_tecnico": "Verificare cambi di figure chiave o nuove unità produttive non riflesse negli atti."
            },
            {
              "id": "D-01-008",
              "testo": "È presente documentazione relativa alla riunione periodica di prevenzione e protezione (ove obbligatoria)?",
              "ordine": 13,
              "obbligatoria": false,
              "tipo_risposta": "conformita_5",
              "correzione_default": "Programmare e documentare la riunione periodica annuale di prevenzione e protezione, redigendo verbale con gli argomenti discussi e le presenze.",
              "note_tecnico": "Obbligatoria nelle aziende con più di 15 dipendenti."
            }
          ]
        }'::jsonb
      ),
      '{sezioni,5}',
      -- TODO Fase futura: la domanda D-06-007 (verifica periodica messa a terra)
      -- avrà un campo data verifica + calcolo scadenza automatico
      -- (periodicità configurabile 2 o 5 anni) — vedi specifiche evoluzione motore.
      '{
        "id": "SEZ-06",
        "nome": "Attrezzature, impianti e manutenzioni",
        "descrizione": "Stato e conformità delle attrezzature di lavoro, degli impianti e delle manutenzioni.",
        "ordine": 6,
        "domande": [
          {
            "id": "D-06-001",
            "testo": "Le attrezzature di lavoro presenti sono idonee all''uso, in buono stato manutentivo e prive di difetti visibili?",
            "ordine": 1,
            "obbligatoria": true,
            "tipo_risposta": "conformita_5",
            "correzione_default": "Procedere alla manutenzione ordinaria o straordinaria delle attrezzature con difetti visibili. Togliere dal servizio le attrezzature non sicure fino a riparazione.",
            "note_tecnico": "Verificare cavi deteriorati, protezioni mancanti, dispositivi di sicurezza manomessi."
          },
          {
            "id": "D-06-002",
            "testo": "Le attrezzature soggette a verifica periodica obbligatoria (Allegato VII) risultano verificate nei tempi previsti?",
            "ordine": 2,
            "obbligatoria": false,
            "tipo_risposta": "conformita_5",
            "correzione_default": "Verificare lo scadenziario delle verifiche periodiche obbligatorie. Contattare INAIL o soggetti abilitati per le verifiche scadute.",
            "note_tecnico": "Se non presenti attrezzature soggette ad Allegato VII, classificare come NA."
          },
          {
            "id": "D-06-003",
            "testo": "L''impianto elettrico è dotato di dichiarazione di conformità o di dichiarazione di rispondenza?",
            "ordine": 3,
            "obbligatoria": true,
            "tipo_risposta": "conformita_5",
            "correzione_default": "Richiedere all''installatore o a un professionista abilitato la dichiarazione di conformita'' dell''impianto elettrico o la dichiarazione di rispondenza per gli impianti preesistenti.",
            "note_tecnico": "Verificare la presenza del documento (DiCo / DiRi per impianti preesistenti)."
          },
          {
            "id": "D-06-006",
            "testo": "Denuncia dell''impianto di messa a terra",
            "ordine": 4,
            "obbligatoria": true,
            "tipo_risposta": "conformita_5",
            "correzione_default": "Presentare la denuncia dell''impianto di messa a terra all''INAIL (ex ISPESL) ai sensi del DPR 462/2001 e conservarne copia in azienda.",
            "note_tecnico": "Verificare la presenza della denuncia dell''impianto di messa a terra all''INAIL (ex ISPESL), come previsto dal DPR 462/2001.",
            "rif_normativo": "DPR 462/2001"
          },
          {
            "id": "D-06-007",
            "testo": "Verifica periodica dell''impianto di messa a terra",
            "ordine": 5,
            "obbligatoria": true,
            "tipo_risposta": "conformita_5",
            "correzione_default": "Far eseguire la verifica periodica dell''impianto di messa a terra da organismo abilitato nei tempi previsti dal DPR 462/2001 (biennale ordinario; annuale negli ambienti a maggior rischio di incendio o esplosione).",
            "note_tecnico": "Verificare l''esecuzione della verifica periodica dell''impianto di messa a terra nei tempi previsti (biennale per ambienti ordinari, annuale per ambienti a maggior rischio in caso di incendio o esplosione, ai sensi del DPR 462/2001).",
            "rif_normativo": "DPR 462/2001"
          },
          {
            "id": "D-06-005",
            "testo": "Sono presenti procedure di manutenzione ordinaria e straordinaria documentate per le attrezzature critiche?",
            "ordine": 6,
            "obbligatoria": false,
            "tipo_risposta": "conformita_5",
            "correzione_default": "Predisporre un piano di manutenzione documentato per le attrezzature critiche, con registrazione degli interventi effettuati.",
            "note_tecnico": "Verificare registro manutenzioni o sistema equivalente."
          }
        ]
      }'::jsonb
    ),
  versione = 2
WHERE attivo = true;
