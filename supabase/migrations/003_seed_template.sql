-- ============================================================
-- SafeCheck — Seed template master (60 domande, 7 sezioni)
-- Generato da: seed/templates (prototipo index.html, DOMANDE v1.0.4)
-- Tipi risposta: conformita_5 (C/PC/NC/NV/NA)
-- campo_extra nominativo presente sulle figure di SEZ-01
--   (DL/RSPP singoli; tutte le altre figure multiple)
-- Conteggio sezioni: SEZ-01 13, SEZ-02 7, SEZ-03 10, SEZ-04 7,
--   SEZ-05 7, SEZ-06 6, SEZ-07 5.
-- ============================================================

INSERT INTO template_master (
  id,
  nome,
  descrizione,
  versione,
  struttura_json,
  attivo
) VALUES (
  gen_random_uuid(),
  'SafeCheck — Verbale Sicurezza sul Lavoro',
  'Template standard per sopralluogo periodico D.Lgs. 81/2008',
  2,
  '{
  "id": "tmpl-safecheck-v1",
  "nome": "SafeCheck — Verbale Sicurezza sul Lavoro",
  "versione": 2,
  "origine": {
    "template_id": "verbale-sopralluogo-sicurezza-lavoro-v1",
    "versione_prototipo": "1.0.4"
  },
  "sezioni": [
    {
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
          "campo_extra": {
            "tipo": "nominativo",
            "label": "DL",
            "multiplo": false
          }
        },
        {
          "id": "D-01-001",
          "testo": "È presente e documentato l''atto di nomina del Responsabile del Servizio di Prevenzione e Protezione (RSPP)?",
          "ordine": 2,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Predisporre atto formale di nomina del RSPP firmato dal datore di lavoro, con accettazione dell''incarico da parte del nominato.",
          "note_tecnico": "Verificare che la nomina sia sottoscritta dal datore di lavoro e accettata dal nominato (art. 32).",
          "campo_extra": {
            "tipo": "nominativo",
            "label": "RSPP",
            "multiplo": false
          }
        },
        {
          "id": "D-01-003",
          "testo": "Sono presenti e documentate le nomine degli Addetti al Servizio di Prevenzione e Protezione (ASPP), ove previsti?",
          "ordine": 3,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Valutare la necessita'' di ASPP in base alle dimensioni e alla tipologia di rischio. In caso di necessita'', predisporre atti di nomina e verificare i requisiti formativi degli addetti.",
          "note_tecnico": "Gli ASPP sono obbligatori solo in alcune tipologie/dimensioni aziendali.",
          "campo_extra": {
            "tipo": "nominativo",
            "label": "ASPP",
            "multiplo": true
          }
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
          "campo_extra": {
            "tipo": "nominativo",
            "label": "MC",
            "multiplo": true
          }
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
          "campo_extra": {
            "tipo": "nominativo",
            "label": "RLS",
            "multiplo": true
          }
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
          "campo_extra": {
            "tipo": "nominativo",
            "label": "Addetti antincendio",
            "multiplo": true
          }
        },
        {
          "id": "D-01-005",
          "testo": "Sono presenti e documentate le nomine degli Addetti al Primo Soccorso?",
          "ordine": 9,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Nominare formalmente gli addetti al primo soccorso e verificare che abbiano completato il corso di formazione specifico secondo il gruppo di appartenenza dell''azienda (A, B o C ai sensi del D.M. 388/2003).",
          "note_tecnico": "Gruppo A/B/C determina durata e contenuto formazione. Aggiornamento ogni 3 anni.",
          "campo_extra": {
            "tipo": "nominativo",
            "label": "Addetti primo soccorso",
            "multiplo": true
          }
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
          "campo_extra": {
            "tipo": "nominativo",
            "label": "Preposti",
            "multiplo": true
          }
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
          "campo_extra": {
            "tipo": "nominativo",
            "label": "Dirigenti",
            "multiplo": true
          }
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
    },
    {
      "id": "SEZ-02",
      "nome": "Documentazione di sicurezza",
      "descrizione": "Disponibilità, completezza e aggiornamento dei documenti di sicurezza obbligatori.",
      "ordine": 2,
      "domande": [
        {
          "id": "D-02-001",
          "testo": "È presente il Documento di Valutazione dei Rischi (DVR) redatto ai sensi del D.Lgs. 81/2008?",
          "ordine": 1,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Predisporre il Documento di Valutazione dei Rischi secondo le modalita'' previste dagli articoli 28 e 29 del D.Lgs. 81/2008, con identificazione di tutti i rischi presenti e le relative misure di prevenzione e protezione.",
          "note_tecnico": "Verificare data, firma datore/RSPP/RLS e inclusione dei rischi specifici dell''attività."
        },
        {
          "id": "D-02-002",
          "testo": "Il DVR risulta aggiornato a seguito di modifiche del processo produttivo, dell''organizzazione o degli ambienti?",
          "ordine": 2,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Procedere all''aggiornamento del DVR entro 30 giorni dalla modifica che lo rende obsoleto, ovvero effettuare la rielaborazione completa se le modifiche sono sostanziali.",
          "note_tecnico": "Confrontare data ultima revisione con infortuni, modifiche, nuove attrezzature."
        },
        {
          "id": "D-02-003",
          "testo": "È disponibile il Piano di Emergenza ed Evacuazione (PEE) o documento equivalente?",
          "ordine": 3,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Redigere o aggiornare il Piano di Emergenza, includendo le procedure di evacuazione, i punti di raccolta, i ruoli degli addetti e le modalita'' di comunicazione con i soccorsi.",
          "note_tecnico": "Verificare se affisso, conosciuto dai lavoratori e se sono state fatte prove di evacuazione."
        },
        {
          "id": "D-02-004",
          "testo": "Sono presenti i registri di verifica e manutenzione delle attrezzature soggette a controllo periodico?",
          "ordine": 4,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Istituire o aggiornare i registri di controllo delle attrezzature soggette a verifiche periodiche, assicurando che le verifiche siano effettuate nei tempi previsti e che i risultati siano documentati.",
          "note_tecnico": "Verificare quali attrezzature presenti rientrano nell''Allegato VII. Niente NC generalizzate."
        },
        {
          "id": "D-02-005",
          "testo": "È disponibile il documento di valutazione del rischio incendio o la relativa CPI, se richiesta?",
          "ordine": 5,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare l''obbligo specifico di CPI per l''attivita'' svolta e, se necessario, avviare la pratica di prevenzione incendi presso il Comando Provinciale dei Vigili del Fuoco competente.",
          "note_tecnico": "Non tutte le attività richiedono CPI. Verificare D.P.R. 151/2011."
        },
        {
          "id": "D-02-006",
          "testo": "Sono presenti e aggiornate le schede di sicurezza (SDS) delle sostanze e preparati pericolosi utilizzati?",
          "ordine": 6,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Raccogliere e aggiornare le schede di sicurezza di tutti i prodotti chimici utilizzati, verificando che siano nella versione aggiornata (formato a 16 sezioni) e accessibili ai lavoratori.",
          "note_tecnico": "Se non si usano sostanze pericolose, classificare come NA."
        },
        {
          "id": "D-02-008",
          "testo": "Sono presenti autorizzazioni, licenze o certificazioni obbligatorie per lo svolgimento dell''attività specifica?",
          "ordine": 7,
          "obbligatoria": false,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare quali autorizzazioni, licenze o certificazioni sono obbligatorie per la specifica attivita'' svolta e assicurarsi che siano in corso di validita''.",
          "note_tecnico": "Punto generico, dipende dall''attività. Se non rilevante, classificare come NA."
        }
      ]
    },
    {
      "id": "SEZ-03",
      "nome": "Formazione, informazione e addestramento",
      "descrizione": "Attività di formazione, informazione e addestramento dei lavoratori.",
      "ordine": 3,
      "domande": [
        {
          "id": "D-03-001",
          "testo": "Formazione lavoratori (generale + specifica + aggiornamento)",
          "ordine": 1,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Pianificare o completare la formazione generale e specifica per tutti i lavoratori. Verificare aggiornamenti scaduti o prossimi alla scadenza (6 ore ogni 5 anni).",
          "note_tecnico": "Verificare che tutti i lavoratori abbiano completato formazione generale e specifica per il livello di rischio (basso 8h, medio 12h, alto 16h) e aggiornamento (6h ogni 5 anni). Accordo Stato-Regioni 2025."
        },
        {
          "id": "D-03-002",
          "testo": "Formazione preposti (12 ore + aggiornamento)",
          "ordine": 2,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Pianificare formazione specifica per preposti (12 ore) e relativo aggiornamento periodico.",
          "note_tecnico": "Verificare formazione specifica per preposti (12 ore) e aggiornamento periodico. Solo se presenti preposti formali o di fatto. Se non applicabile, rispondere NA."
        },
        {
          "id": "D-03-003",
          "testo": "Formazione dirigenti (12 ore + aggiornamento)",
          "ordine": 3,
          "obbligatoria": false,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Pianificare formazione specifica per dirigenti (12 ore) e relativo aggiornamento periodico.",
          "note_tecnico": "Verificare formazione specifica per dirigenti (12 ore) e aggiornamento periodico. Solo se presenti dirigenti ai fini sicurezza. Se non applicabile, rispondere NA."
        },
        {
          "id": "D-03-004",
          "testo": "Formazione Datore di Lavoro (corso 16 ore obbligatorio)",
          "ordine": 4,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Pianificare il corso di formazione obbligatorio per il Datore di Lavoro della durata di 16 ore, ai sensi dell''Accordo Stato-Regioni 2025.",
          "note_tecnico": "Verificare attestato corso obbligatorio 16 ore per il Datore di Lavoro. Obbligatorio per tutti i DL indipendentemente dal settore. Accordo Stato-Regioni 2025."
        },
        {
          "id": "D-03-005",
          "testo": "Formazione DL che svolge direttamente i compiti del SPP (percorso DL-SPP, se applicabile)",
          "ordine": 5,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Completare il percorso formativo DL-SPP: modulo comune 8 ore + moduli integrativi di settore, ai sensi dell''Accordo Stato-Regioni 2025.",
          "note_tecnico": "Solo se il DL svolge direttamente i compiti del SPP ai sensi dell''art. 34 D.Lgs. 81/08. Percorso aggiuntivo: modulo comune 8 ore + moduli integrativi di settore. Se non applicabile, rispondere NA."
        },
        {
          "id": "D-03-006",
          "testo": "Formazione RSPP (Moduli A+B+C se interno; verifica requisiti se esterno)",
          "ordine": 6,
          "obbligatoria": false,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Per RSPP interno: completare il percorso formativo Moduli A+B+C ai sensi dell''art. 32 D.Lgs. 81/08. Per RSPP esterno: acquisire e conservare in azienda documentazione dei requisiti formativi del consulente.",
          "note_tecnico": "Se RSPP interno: verificare Moduli A+B di settore+C, salvo esoneri. Se RSPP esterno: acquisire evidenza dei requisiti formativi del consulente, non organizzare corsi per lui."
        },
        {
          "id": "D-03-007",
          "testo": "Formazione ASPP (Moduli A+B, se nominato)",
          "ordine": 7,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Completare il percorso formativo ASPP: Moduli A+B ai sensi dell''art. 32 D.Lgs. 81/08 e pianificare aggiornamenti quinquennali.",
          "note_tecnico": "Solo se sono stati nominati ASPP (art. 32 D.Lgs. 81/08). Verificare Moduli A+B e aggiornamenti quinquennali. Se nessun ASPP nominato, rispondere NA."
        },
        {
          "id": "D-03-008",
          "testo": "Formazione RLS (corso iniziale 32 ore + aggiornamento annuale, se presente RLS aziendale)",
          "ordine": 8,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Pianificare corso iniziale 32 ore per il RLS e aggiornamento annuale (4 ore per aziende fino a 50 lavoratori, 8 ore per aziende oltre 50 lavoratori), ai sensi dell''art. 37 D.Lgs. 81/08.",
          "note_tecnico": "Solo se è eletto/designato RLS aziendale. Corso iniziale 32 ore (di cui 12 sui rischi specifici). Aggiornamento: 4 ore/anno per aziende 15-50 lav.; 8 ore/anno per aziende >50 lav. Se assente o RLST territoriale, rispondere NA."
        },
        {
          "id": "D-03-009",
          "testo": "Formazione Addetti Antincendio (corso specifico per livello di rischio + aggiornamento)",
          "ordine": 9,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare e completare la formazione per gli addetti antincendio in base al livello di rischio. Pianificare l''aggiornamento quinquennale.",
          "note_tecnico": "Verificare corso specifico per il livello di rischio incendio: livello 1 = 4 ore, livello 2 = 8 ore, livello 3 = 16 ore. Aggiornamento quinquennale. Incrociare con nomine SEZ-01."
        },
        {
          "id": "D-03-010",
          "testo": "Formazione Addetti Primo Soccorso (corso DM 388/2003 + aggiornamento triennale)",
          "ordine": 10,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare e completare la formazione per gli addetti al primo soccorso (DM 388/2003). Pianificare l''aggiornamento triennale.",
          "note_tecnico": "Verificare corso per il gruppo di appartenenza: gruppo A = 16 ore, gruppi B/C = 12 ore. Aggiornamento almeno triennale. Incrociare con nomine SEZ-01."
        }
      ]
    },
    {
      "id": "SEZ-04",
      "nome": "Gestione emergenze e primo soccorso",
      "descrizione": "Mezzi e procedure per la gestione delle emergenze e del primo soccorso.",
      "ordine": 4,
      "domande": [
        {
          "id": "D-04-001",
          "testo": "Sono presenti mezzi di estinzione portatili (estintori) in numero e posizionamento adeguati?",
          "ordine": 1,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare numero, tipo (polvere/CO2/altro), posizionamento e segnalazione degli estintori. Integrare o riposizionare secondo quanto previsto dalla valutazione del rischio incendio.",
          "note_tecnico": "Verificare revisione semestrale e periodica (6 anni) e la segnaletica."
        },
        {
          "id": "D-04-002",
          "testo": "Gli estintori presenti risultano revisionati e con data di scadenza valida?",
          "ordine": 2,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Procedere alla revisione periodica degli estintori scaduti attraverso ditte autorizzate. Sostituire o togliere dal servizio gli estintori non conformi.",
          "note_tecnico": "Verificare il cartellino di ogni estintore: la revisione semestrale è verificabile a vista."
        },
        {
          "id": "D-04-003",
          "testo": "È presente il presidio di primo soccorso (cassetta o pacchetto di medicazione) con contenuto conforme?",
          "ordine": 3,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare la presenza della cassetta di primo soccorso e controllare che il contenuto sia completo, non scaduto e conforme all''allegato del D.M. 388/2003 relativo al gruppo di appartenenza.",
          "note_tecnico": "Contenuto minimo varia per gruppo (A/B/C). Controllare scadenza dei materiali."
        },
        {
          "id": "D-04-004",
          "testo": "Le vie di esodo e le uscite di emergenza sono libere, segnalate e praticabili?",
          "ordine": 4,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Rimuovere ostruzione dalle vie di esodo, verificare il funzionamento delle porte antipanico, ripristinare o integrare la segnaletica di emergenza. Le vie di esodo devono essere sempre libere e praticabili.",
          "note_tecnico": "Verificare ingombri, porte bloccate, segnaletica e illuminazione di emergenza."
        },
        {
          "id": "D-04-005",
          "testo": "È presente e funzionante l''illuminazione di emergenza?",
          "ordine": 5,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Installare o ripristinare l''illuminazione di emergenza nelle vie di esodo, verificando che si attivi automaticamente in caso di mancanza di corrente e che l''autonomia sia adeguata.",
          "note_tecnico": "Verificare plafoniere di emergenza; testare l''attivazione se possibile."
        },
        {
          "id": "D-04-006",
          "testo": "È presente un sistema di allarme antincendio adeguato alla tipologia del luogo di lavoro?",
          "ordine": 6,
          "obbligatoria": false,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare l''obbligo e la tipologia di sistema di allarme in base alla classificazione del rischio incendio e alla categoria del luogo di lavoro. Installare o adeguare il sistema se richiesto.",
          "note_tecnico": "Non tutti i luoghi richiedono rilevazione automatica. Verificare le prescrizioni."
        },
        {
          "id": "D-04-007",
          "testo": "Sono affisse planimetrie aggiornate con vie di esodo, punti di raccolta e presidi di emergenza?",
          "ordine": 7,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Predisporre e affiggere planimetrie di emergenza aggiornate nei luoghi di passaggio e nelle aree di lavoro, con evidenza delle vie di esodo, delle uscite di sicurezza, dei punti di raccolta e della posizione dei presidi.",
          "note_tecnico": "Planimetrie datate o riferite a layout modificati sono Parzialmente Conformi."
        }
      ]
    },
    {
      "id": "SEZ-05",
      "nome": "Ambienti di lavoro",
      "descrizione": "Condizioni degli ambienti: illuminazione, aerazione, ordine, pulizia, strutture.",
      "ordine": 5,
      "domande": [
        {
          "id": "D-05-001",
          "testo": "Gli ambienti di lavoro sono in condizioni adeguate di pulizia, ordine e assenza di ingombri non necessari?",
          "ordine": 1,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Organizzare e documentare le procedure di pulizia ordinaria e straordinaria degli ambienti. Rimuovere materiali e oggetti non pertinenti dalle aree di lavoro.",
          "note_tecnico": "Verificare stoccaggi improvvisati, pavimenti scivolosi, accumuli nelle vie di transito."
        },
        {
          "id": "D-05-002",
          "testo": "L''illuminazione degli ambienti e dei posti di lavoro è adeguata alle attività svolte?",
          "ordine": 2,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare i livelli di illuminamento nelle aree di lavoro rispetto ai valori indicativi per la tipologia di attivita''. Integrare o adeguare l''illuminazione dove insufficiente.",
          "note_tecnico": "In assenza di luxmetro, valutazione qualitativa delle aree poco illuminate."
        },
        {
          "id": "D-05-003",
          "testo": "La ventilazione degli ambienti è adeguata (naturale o meccanica) rispetto ad attività e rischi?",
          "ordine": 3,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare l''adeguatezza della ventilazione rispetto alle attivita'' svolte e ai prodotti utilizzati. Installare o adeguare sistemi di ventilazione meccanica ove necessario.",
          "note_tecnico": "Valutare odori, vapori, polveri. Con agenti chimici spesso serve misura strumentale."
        },
        {
          "id": "D-05-004",
          "testo": "Pavimenti, pareti e superfici di transito sono in condizioni strutturali sicure (assenza di buche, scivolosità, danni)?",
          "ordine": 4,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Procedere alla riparazione o alla segnalazione temporanea delle aree con pavimenti danneggiati, scivolosi o con dislivelli pericolosi. Verificare i percorsi di transito e le aree di passaggio.",
          "note_tecnico": "Verificare corridoi, scale, aree produttive. Documentare la localizzazione precisa."
        },
        {
          "id": "D-05-005",
          "testo": "Le scale fisse e portatili (ove presenti) sono in condizioni sicure e rispettano i requisiti strutturali?",
          "ordine": 5,
          "obbligatoria": false,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare lo stato di corrimani, parapetti, gradini e antiscivolamento delle scale. Sostituire o riparare le parti danneggiate. Le scale portatili devono essere marcate CE e usate correttamente.",
          "note_tecnico": "Se non sono presenti scale, classificare come NA. Verificare marcatura CE delle portatili."
        },
        {
          "id": "D-05-006",
          "testo": "I servizi igienici e gli spogliatoi (ove presenti) sono in numero adeguato e in condizioni igieniche accettabili?",
          "ordine": 6,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare il numero di servizi igienici rispetto ai lavoratori presenti e il loro stato manutentivo. Pianificare la pulizia e la manutenzione ordinaria.",
          "note_tecnico": "Valutare disponibilità e stato. Niente censimento nominale dei lavoratori."
        },
        {
          "id": "D-05-007",
          "testo": "La segnaletica di sicurezza (divieti, obblighi, avvertimento, salvataggio) è adeguata, visibile e aggiornata?",
          "ordine": 7,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare la completezza e lo stato della segnaletica di sicurezza. Integrare i cartelli mancanti e sostituire quelli danneggiati o sbiaditi.",
          "note_tecnico": "Divieto (rosso), avvertimento (giallo), obbligo (blu), salvataggio (verde). Sbiadita = PC."
        }
      ]
    },
    {
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
    },
    {
      "id": "SEZ-07",
      "nome": "DPI, procedure e comportamenti operativi",
      "descrizione": "Disponibilità e uso corretto dei DPI e delle procedure operative.",
      "ordine": 7,
      "domande": [
        {
          "id": "D-07-001",
          "testo": "I DPI previsti dalla valutazione del rischio sono disponibili, idonei e forniti ai lavoratori?",
          "ordine": 1,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Verificare la dotazione di DPI rispetto a quanto previsto dal DVR. Integrare o sostituire i DPI mancanti, scaduti o non idonei. I DPI devono essere marcati CE.",
          "note_tecnico": "Verificare la dotazione rispetto al DVR. I DPI devono essere marcati CE."
        },
        {
          "id": "D-07-002",
          "testo": "I lavoratori sono informati e addestrati sull''uso corretto dei DPI assegnati?",
          "ordine": 2,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Documentare le attivita'' di informazione e addestramento sull''uso, la manutenzione e la conservazione dei DPI assegnati.",
          "note_tecnico": "Verificare documentazione su uso, manutenzione e conservazione dei DPI."
        },
        {
          "id": "D-07-003",
          "testo": "I DPI in uso sono in buono stato di conservazione, non deteriorati e con marcatura CE visibile?",
          "ordine": 3,
          "obbligatoria": true,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Sostituire i DPI deteriorati, scaduti o privi di marcatura CE. Istituire un sistema di controllo e sostituzione periodica.",
          "note_tecnico": "Guanti strappati, elmetti crepati, filtri scaduti = NC."
        },
        {
          "id": "D-07-004",
          "testo": "Esistono procedure operative documentate per le attività a rischio specifico (quota, carichi, agenti chimici)?",
          "ordine": 4,
          "obbligatoria": false,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Predisporre procedure operative scritte per le attivita'' che comportano rischi specifici, incluse le misure di prevenzione da adottare prima, durante e dopo le operazioni.",
          "note_tecnico": "Se l''attività non presenta rischi specifici documentabili, classificare come NA."
        },
        {
          "id": "D-07-005",
          "testo": "Il comportamento osservato dei lavoratori durante il sopralluogo è coerente con le misure di prevenzione previste?",
          "ordine": 5,
          "obbligatoria": false,
          "tipo_risposta": "conformita_5",
          "correzione_default": "Rafforzare le attivita'' di supervisione e informazione ai lavoratori. I preposti devono vigilare sul rispetto delle misure di prevenzione.",
          "note_tecnico": "Valutazione qualitativa. Documentare senza identificare singoli lavoratori."
        }
      ]
    }
  ]
}'::jsonb,
  true
);
