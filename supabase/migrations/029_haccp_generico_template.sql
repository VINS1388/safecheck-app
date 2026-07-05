-- ============================================================
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
  $haccp_json${
  "modulo": "haccp_generico",
  "template": "Template HACCP generico",
  "versione_contenuto": "1.0",
  "tipo_scoring": "haccp_media_sezione",
  "etichette": {
    "C": "Conforme",
    "PC": "Migliorabile",
    "NC": "Non Conforme",
    "NA": "Non Applicabile",
    "NV": "Non Verificato"
  },
  "scoring": {
    "punti": {
      "C": 1,
      "PC": 0.5,
      "NC": 0
    },
    "esclusi_dal_denominatore": [
      "NA",
      "NV"
    ],
    "punteggio_sezione": "media_punti_risposti_x100",
    "livello_complessivo": "media_sezioni_valutate",
    "nv_evidenziati": true,
    "nota_nv": "Un numero elevato di Non Verificato può limitare l'attendibilità complessiva della verifica e deve essere motivato nelle note finali."
  },
  "obbligo_osservazione": {
    "C": "facoltativa",
    "PC": "obbligatoria",
    "NC": "obbligatoria",
    "NV": "motivazione_obbligatoria",
    "NA": "facoltativa"
  },
  "intestazione_extra": [
    "ora_inizio",
    "ora_fine",
    "referente_presente",
    "funzione_referente",
    "attivita_in_corso",
    "aree_visitate",
    "aree_non_visitate_motivo",
    "flag_rilievi_fotografici",
    "presa_visione_referente_testuale",
    "note_finali_tecnico"
  ],
  "sezioni": [
    {
      "id": "SEZ-H01",
      "titolo": "Documentazione HACCP e registrazioni",
      "categoria_prevalente": "documentale",
      "domande": [
        {
          "id": "D-H01-001",
          "titolo": "Manuale di autocontrollo",
          "testo": "Il manuale di autocontrollo è presente, nella revisione corrente, e descrive fedelmente l'attività reale (locali, processi, prodotti, attrezzature).",
          "categoria": "documentale",
          "applicabilita": null,
          "guida": {
            "conforme": "Manuale disponibile in sede, identificato (revisione/data), coerente con ciò che si osserva durante la visita.",
            "migliorabile": "Manuale presente ma con disallineamenti minori rispetto alla realtà (attrezzatura non censita, planimetria da aggiornare) o elementi formali incompleti.",
            "non_conforme": "Manuale assente, irreperibile, o che non copre processi realmente svolti (lavorazioni non descritte, locali non previsti)."
          },
          "note_template": null
        },
        {
          "id": "D-H01-002",
          "titolo": "Titoli abilitativi sanitari",
          "testo": "I titoli abilitativi sanitari dell'attività (registrazione/notifica sanitaria, SCIA) sono presenti, reperibili e coerenti con le attività effettivamente svolte.",
          "categoria": "documentale",
          "applicabilita": null,
          "guida": {
            "conforme": "Documentazione presente, reperibile in tempi ragionevoli, intestazione e attività coerenti con lo stato di fatto.",
            "migliorabile": "Documentazione presente ma disordinata o di difficile reperimento; passaggi societari ricostruibili ma non lineari.",
            "non_conforme": "Titolo assente, non aggiornato rispetto a variazioni rilevanti (attività, locali, ragione sociale) nei termini previsti, o attività svolte non coperte."
          },
          "note_template": null
        },
        {
          "id": "D-H01-003",
          "titolo": "Registrazioni di autocontrollo",
          "testo": "Le registrazioni previste dal piano di autocontrollo (temperature, sanificazioni, ricevimento merci, altri controlli) sono compilate, aggiornate e firmate ove previsto.",
          "categoria": "documentale",
          "applicabilita": null,
          "guida": {
            "conforme": "Registrazioni presenti e aggiornate per tutti i controlli previsti; compilazione attendibile.",
            "migliorabile": "Lacune sporadiche (date mancanti isolate, firme assenti, compilazione sommaria) su controlli non critici; il sistema è comunque vivo e applicato.",
            "non_conforme": "Registrazioni sistematicamente assenti o inattendibili, oppure assenza non accidentale su controlli critici previsti dal piano (es. CCP)."
          },
          "note_template": null
        },
        {
          "id": "D-H01-004",
          "titolo": "Archiviazione e reperibilità",
          "testo": "La documentazione da esibire in caso di controllo ufficiale è archiviata in modo ordinato e almeno un addetto presente è in grado di reperirla ed esibirla.",
          "categoria": "documentale",
          "applicabilita": null,
          "guida": {
            "conforme": "Archiviazione ordinata, consultazione rapida, personale consapevole di dove si trova cosa.",
            "migliorabile": "Documentazione completa ma disordinata o reperita con difficoltà; l'addetto presente esita ma arriva al documento.",
            "non_conforme": "Documentazione non esibibile durante la visita o nessun addetto presente in grado di accedervi."
          },
          "note_template": null
        },
        {
          "id": "D-H01-005",
          "titolo": "Gestione non conformità e azioni correttive",
          "testo": "Esiste ed è applicata una modalità documentata di gestione delle non conformità e delle relative azioni correttive.",
          "categoria": "documentale",
          "applicabilita": null,
          "guida": {
            "conforme": "Procedura presente, registrazioni delle NC gestite disponibili, azioni correttive tracciate e chiuse.",
            "migliorabile": "Procedura presente ma registrazioni incomplete o non sistematiche; le NC risultano comunque gestite nella sostanza.",
            "non_conforme": "Nessuna gestione documentata, oppure NC note e ricorrenti senza alcuna azione correttiva adottata."
          },
          "note_template": null
        },
        {
          "id": "D-H01-006",
          "titolo": "Informazioni al consumatore e allergeni",
          "testo": "Le informazioni obbligatorie al consumatore, in particolare sugli allergeni, sono comunicate con uno strumento idoneo, completo e aggiornato (menu, libro ingredienti, cartellonistica).",
          "categoria": "documentale",
          "applicabilita": "Attività con somministrazione o vendita al consumatore finale; altrimenti NA.",
          "guida": {
            "conforme": "Strumento presente, aggiornato, facilmente consultabile; il personale sa indirizzare il cliente.",
            "migliorabile": "Strumento presente ma non aggiornato di recente, di difficile consultazione o in cattivo stato; informazione comunque ricostruibile.",
            "non_conforme": "Strumento assente, oppure anche una sola preparazione con informazione allergeni mancante o errata."
          },
          "note_template": null
        },
        {
          "id": "D-H01-007",
          "titolo": "Piano analitico e campionamenti",
          "testo": "Ove previsto dal piano di autocontrollo o dalla tipologia dell'attività, sono disponibili le evidenze dei campionamenti previsti (prodotti, superfici, acqua) e degli esiti, con gestione degli eventuali esiti sfavorevoli.",
          "categoria": "documentale",
          "applicabilita": "Solo ove previsto dal piano di autocontrollo o dalla tipologia dell'attività; altrimenti NA.",
          "guida": {
            "conforme": "Rapporti di prova disponibili per i campionamenti previsti, frequenze rispettate, esiti sfavorevoli gestiti con azioni documentate.",
            "migliorabile": "Campionamenti eseguiti ma con frequenze non pienamente rispettate o archiviazione lacunosa; nessun esito sfavorevole ignorato.",
            "non_conforme": "Piano analitico previsto ma mai attuato, oppure esiti sfavorevoli noti e privi di qualunque gestione."
          },
          "note_template": "Non trasformare in NC automatica per piccole attività senza piano analitico: l'applicabilità va valutata sul manuale."
        }
      ]
    },
    {
      "id": "SEZ-H02",
      "titolo": "Formazione e consapevolezza del personale",
      "categoria_prevalente": "formazione",
      "domande": [
        {
          "id": "D-H02-001",
          "titolo": "Responsabile dell'autocontrollo",
          "testo": "Il responsabile dell'autocontrollo è individuato formalmente e ha una formazione specifica in corso di validità ove prevista.",
          "categoria": "formazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Nominativo individuato (organigramma/incarico), attestato presente e valido.",
            "migliorabile": "Responsabile operativamente individuato ma formalizzazione incompleta, o attestato in scadenza ravvicinata con aggiornamento già pianificato.",
            "non_conforme": "Nessun responsabile individuato, o attestato assente/scaduto senza pianificazione."
          },
          "note_template": null
        },
        {
          "id": "D-H02-002",
          "titolo": "Formazione degli addetti",
          "testo": "Gli addetti alla manipolazione degli alimenti dispongono di attestato alimentarista valido secondo la normativa regionale applicabile.",
          "categoria": "formazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Tutti gli addetti verificati con attestato presente e valido.",
            "migliorabile": "Lacune limitate (singoli addetti, personale di recentissimo inserimento con formazione già programmata e affiancamento in atto).",
            "non_conforme": "Quota rilevante del personale priva di attestato o con attestati scaduti, senza alcuna pianificazione."
          },
          "note_template": null
        },
        {
          "id": "D-H02-003",
          "titolo": "Aggiornamento formativo",
          "testo": "Gli aggiornamenti formativi periodici previsti sono stati effettuati o risultano pianificati nei termini.",
          "categoria": "formazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Aggiornamenti in regola per il personale soggetto.",
            "migliorabile": "Scadenze superate da poco con percorso di aggiornamento già attivato e documentato.",
            "non_conforme": "Aggiornamenti sistematicamente scaduti senza alcuna attivazione."
          },
          "note_template": null
        },
        {
          "id": "D-H02-004",
          "titolo": "Coerenza tra procedure e prassi operativa",
          "testo": "Dal confronto informale con il personale durante la visita emerge coerenza tra le procedure del piano e la prassi quotidiana (sanificazione, temperature, allergeni, gestione delle anomalie di reparto).",
          "categoria": "formazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Le prassi descritte e osservate sono coerenti con le procedure del piano.",
            "migliorabile": "Coerenza parziale o incertezze su aspetti non critici; la pratica osservata resta corretta.",
            "non_conforme": "La prassi reale contraddice procedure critiche (es. gestione allergeni o temperature non riconducibili a quanto previsto dal piano)."
          },
          "note_template": "Non è un esame orale al lavoratore: va condotta come conversazione operativa a campione, valutando il sistema e non la persona."
        }
      ]
    },
    {
      "id": "SEZ-H03",
      "titolo": "Requisiti strutturali e dotazioni",
      "categoria_prevalente": "strutturale",
      "domande": [
        {
          "id": "D-H03-001",
          "titolo": "Layout e flussi di lavoro",
          "testo": "L'organizzazione dei locali e dei flussi previene incroci a rischio tra percorsi sporchi e puliti, per struttura o tramite misure compensative adeguate alla dimensione dell'attività.",
          "categoria": "strutturale",
          "applicabilita": null,
          "guida": {
            "conforme": "Flussi organizzati senza incroci a rischio; nelle strutture piccole, misure compensative applicate e consapevoli (separazione temporale, pulizia intermedia, organizzazione degli spazi, procedure).",
            "migliorabile": "Compromessi gestiti in modo non formalizzato ma senza rischio osservato per gli alimenti; margini di migliore organizzazione degli spazi.",
            "non_conforme": "Incroci con rischio concreto e non gestito da alcuna misura (strutturale, temporale o procedurale): la NC nasce dal rischio non gestito, mai dalla sola dimensione ridotta della struttura."
          },
          "note_template": null
        },
        {
          "id": "D-H03-002",
          "titolo": "Superfici dei locali",
          "testo": "Pavimenti, pareti e soffitti delle aree alimentari sono integri, lavabili e sanificabili; assenza di distacchi, crepe o condense su zone di lavorazione.",
          "categoria": "strutturale",
          "applicabilita": null,
          "guida": {
            "conforme": "Superfici in buono stato; usura fisiologica lontana dalle zone a rischio.",
            "migliorabile": "Danneggiamenti localizzati (piastrella sbeccata, scrostamento) lontani da alimenti esposti o zone di lavorazione.",
            "non_conforme": "Distacchi, sfaldamenti o condense sopra o in prossimità di zone di lavorazione/alimenti non protetti."
          },
          "note_template": null
        },
        {
          "id": "D-H03-003",
          "titolo": "Attrezzature e utensili",
          "testo": "Attrezzature e utensili sono funzionanti, integri e in buono stato manutentivo; assenza di ruggine diffusa, fessurazioni o parti che possano cedere frammenti.",
          "categoria": "strutturale",
          "applicabilita": null,
          "guida": {
            "conforme": "Attrezzature integre e manutenute; usura fisiologica senza rischio di cessione.",
            "migliorabile": "Anomalie puntuali su attrezzature non a contatto con alimenti, o difetti minori con manutenzione già richiesta (evidenza).",
            "non_conforme": "Attrezzature a contatto con alimenti danneggiate con rischio di corpi estranei (taglieri profondamente incisi, plastiche fessurate, ruggine su superfici di lavoro)."
          },
          "note_template": null
        },
        {
          "id": "D-H03-004",
          "titolo": "Punti di lavaggio mani",
          "testo": "I punti di lavaggio mani sono in numero adeguato, accessibili, con acqua calda, sapone e sistema di asciugatura monouso.",
          "categoria": "strutturale",
          "applicabilita": null,
          "guida": {
            "conforme": "Lavamani presenti e completi nelle aree operative; acqua calda disponibile in tempi congrui.",
            "migliorabile": "Carenze temporanee di corredo (sapone/carta esauriti in giornata) o afflusso di acqua calda lento; lavamani comunque presente e usato.",
            "non_conforme": "Lavamani assente nell'area di lavorazione, fuori uso, inaccessibile, o assenza di acqua calda."
          },
          "note_template": null
        },
        {
          "id": "D-H03-005",
          "titolo": "Servizi igienici e spogliatoi",
          "testo": "Servizi igienici e spogliatoi del personale sono idonei, separati dalle aree di lavorazione, con armadietti a doppio scomparto in numero sufficiente.",
          "categoria": "strutturale",
          "applicabilita": null,
          "guida": {
            "conforme": "Locali idonei, puliti, separati; armadietti adeguati alla forza lavoro.",
            "migliorabile": "Disordine o carenze puntuali (armadietto danneggiato, dotazioni esaurite in giornata) senza impatto sulle aree alimentari.",
            "non_conforme": "Comunicazione diretta non protetta con aree di lavorazione, condizioni igieniche gravemente carenti, o assenza di separazione sporco/pulito per gli indumenti."
          },
          "note_template": null
        },
        {
          "id": "D-H03-006",
          "titolo": "Apparecchiature termiche e strumenti di misura",
          "testo": "Le apparecchiature di conservazione a caldo/freddo hanno temperatura visibile e correttamente impostata; termometri e strumenti di misura sono verificati/tarati secondo il piano.",
          "categoria": "strutturale",
          "applicabilita": null,
          "guida": {
            "conforme": "Display/indicatori funzionanti, set point coerenti con i prodotti, evidenza di verifica o taratura degli strumenti.",
            "migliorabile": "Singolo display non funzionante ma temperatura controllata con termometro portatile e registrata; taratura documentata ma disordinata.",
            "non_conforme": "Apparecchi senza alcun controllo della temperatura, o termometro aziendale assente/non funzionante."
          },
          "note_template": null
        },
        {
          "id": "D-H03-007",
          "titolo": "Acqua potabile e ghiaccio alimentare",
          "testo": "L'approvvigionamento idrico è idoneo (rete pubblica o fonte controllata); eventuali serbatoi, autoclavi o addolcitori sono gestiti e manutenuti; il ghiaccio destinato agli alimenti è prodotto, movimentato e stoccato in modo igienico. Ove l'approvvigionamento non sia da rete pubblica, o il piano lo preveda, sono disponibili le analisi.",
          "categoria": "strutturale",
          "applicabilita": "La parte ghiaccio si applica solo se l'attività produce o utilizza ghiaccio alimentare.",
          "guida": {
            "conforme": "Approvvigionamento da rete o fonte controllata; impianti intermedi gestiti (evidenza di manutenzione/sanificazione); ghiaccio prodotto con acqua potabile, contenitori e palette igienici.",
            "migliorabile": "Gestione sostanzialmente corretta con lacune documentali (manutenzione impianti non registrata, analisi previste in ritardo) senza segnali di rischio.",
            "non_conforme": "Fonte non controllata senza analisi, impianti intermedi in evidente stato di abbandono, ghiaccio prodotto o stoccato in condizioni igieniche inaccettabili."
          },
          "note_template": null
        }
      ]
    },
    {
      "id": "SEZ-H04",
      "titolo": "Igiene di locali, attrezzature e lavorazioni",
      "categoria_prevalente": "igienico",
      "domande": [
        {
          "id": "D-H04-001",
          "titolo": "Condizioni igieniche generali",
          "testo": "Locali e attrezzature si presentano in condizioni igieniche adeguate all'operatività in corso; assenza di sporco pregresso.",
          "categoria": "igienico",
          "applicabilita": null,
          "guida": {
            "conforme": "Pulizia adeguata; il normale sporco di giornata compatibile con la lavorazione in corso non è un rilievo.",
            "migliorabile": "Sporco pregresso localizzato in aree dove gli alimenti sono protetti o lontane dalla lavorazione.",
            "non_conforme": "Sporco pregresso diffuso, o anche localizzato ma su superfici di lavorazione o dove gli alimenti non sono protetti."
          },
          "note_template": null
        },
        {
          "id": "D-H04-002",
          "titolo": "Piano di sanificazione",
          "testo": "Il piano di sanificazione è presente e applicato: prodotti idonei con schede tecniche disponibili, frequenze rispettate, registrazioni effettuate.",
          "categoria": "igienico",
          "applicabilita": null,
          "guida": {
            "conforme": "Piano presente, prodotti coerenti col piano, registrazioni aggiornate, personale che conosce diluizioni e modalità.",
            "migliorabile": "Applicazione sostanzialmente corretta con lacune formali (schede tecniche incomplete, registrazioni saltuarie, prodotto fuori piano ma idoneo).",
            "non_conforme": "Piano assente o disatteso, prodotti non idonei, condizioni igieniche che dimostrano la mancata applicazione."
          },
          "note_template": null
        },
        {
          "id": "D-H04-003",
          "titolo": "Gestione dei prodotti di pulizia",
          "testo": "Detergenti, sanificanti e attrezzature per la pulizia sono stoccati separati dagli alimenti, identificati, e mai presenti nelle aree di lavorazione durante l'attività.",
          "categoria": "igienico",
          "applicabilita": null,
          "guida": {
            "conforme": "Stoccaggio dedicato e identificato, nulla in area di lavorazione durante l'attività.",
            "migliorabile": "Contenitore non identificato o armadietto lasciato aperto, senza prossimità ad alimenti o postazioni attive.",
            "non_conforme": "Prodotti chimici a contatto o in prossimità di alimenti/postazioni di lavoro attive, o stoccati insieme ad attrezzature destinate al contatto alimentare."
          },
          "note_template": null
        },
        {
          "id": "D-H04-004",
          "titolo": "Prevenzione delle contaminazioni crociate",
          "testo": "Le lavorazioni sono organizzate per prevenire contaminazioni crociate: separazione crudo/cotto e sporco/pulito, attenzione agli allergeni, attrezzature dedicate o sanificate tra usi incompatibili.",
          "categoria": "processo",
          "applicabilita": null,
          "guida": {
            "conforme": "Separazioni fisiche o temporali applicate; utensili dedicati o sanificazione intermedia sistematica; gestione allergeni consapevole.",
            "migliorabile": "Scostamenti puntuali senza rischio osservato sul prodotto (es. materiale improprio in laboratorio ma lontano da lavorazioni attive).",
            "non_conforme": "Anche un solo caso grave: stessa superficie/utensile tra crudo e cotto senza sanificazione, promiscuità con rischio concreto, gestione allergeni assente a fronte di dichiarazioni al cliente."
          },
          "note_template": null
        },
        {
          "id": "D-H04-005",
          "titolo": "Gestione dei rifiuti e dei rifiuti specifici",
          "testo": "I contenitori rifiuti nelle aree alimentari sono idonei, con coperchio ad azionamento non manuale, svuotati con frequenza adeguata; gli eventuali rifiuti specifici (oli esausti, sottoprodotti di origine animale ove applicabile) sono raccolti, identificati e conferiti secondo le modalità previste.",
          "categoria": "igienico",
          "applicabilita": null,
          "guida": {
            "conforme": "Contenitori idonei e chiusi, svuotamento regolare, deposito esterno decoroso; oli esausti in contenitori chiusi e identificati con conferimento documentato; eventuali sottoprodotti gestiti secondo le modalità previste.",
            "migliorabile": "Singoli contenitori privi di coperchio o pedale non funzionante, svuotamento occasionalmente tardivo, documentazione di conferimento lacunosa: nessun impatto sugli alimenti.",
            "non_conforme": "Rifiuti accumulati nelle aree di lavorazione, sacchi aperti a terra, sversamenti di oli esausti, promiscuità tra rifiuti specifici e alimenti, cattivi odori con rischio concreto di contaminazione."
          },
          "note_template": null
        },
        {
          "id": "D-H04-006",
          "titolo": "Materiali estranei e incompatibili",
          "testo": "Nelle aree di lavorazione non sono presenti materiali estranei o incompatibili (effetti personali, alimenti privati, farmaci, minuteria, attrezzi da manutenzione).",
          "categoria": "igienico",
          "applicabilita": null,
          "guida": {
            "conforme": "Assenza di materiali impropri nelle aree alimentari.",
            "migliorabile": "Presenza puntuale di oggetti non in uso, chiusi o lontani dagli alimenti (telefono su mensola, effetti in contenitore chiuso).",
            "non_conforme": "Materiali con rischio concreto di contaminazione fisica o chimica in prossimità di alimenti o in uso durante le lavorazioni."
          },
          "note_template": null
        }
      ]
    },
    {
      "id": "SEZ-H05",
      "titolo": "Conservazione alimenti, temperature e MOCA",
      "categoria_prevalente": "conservazione",
      "domande": [
        {
          "id": "D-H05-001",
          "titolo": "Ricevimento e accettazione merci",
          "testo": "Il controllo in accettazione è applicato: integrità degli imballi, temperature al ricevimento ove pertinente, corrispondenza tra merce e documenti, assenza di prodotti alterati o non conformi, gestione del rifiuto merce quando necessario.",
          "categoria": "processo",
          "applicabilita": null,
          "guida": {
            "conforme": "Controlli in accettazione eseguiti e registrati ove previsto; il personale sa cosa verificare e come respingere una consegna non idonea.",
            "migliorabile": "Controlli eseguiti nella sostanza ma registrazione lacunosa o non sistematica; nessuna evidenza di merce non idonea accettata.",
            "non_conforme": "Nessun controllo in accettazione, o evidenza di merce palesemente non idonea (imballi compromessi, catena del freddo interrotta) accettata e immessa in stoccaggio."
          },
          "note_template": "Posizionare come primo punto della sezione nel template applicativo: apre logicamente il flusso della merce."
        },
        {
          "id": "D-H05-002",
          "titolo": "Temperature di conservazione",
          "testo": "Le temperature di conservazione (frigoriferi, congelatori, banchi caldi/freddi) sono coerenti con i prodotti contenuti; rilevazione a campione durante la visita.",
          "categoria": "conservazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Temperature rilevate nei limiti per la tipologia di prodotto; catena freddo/caldo mantenuta anche durante le lavorazioni osservate.",
            "migliorabile": "Scostamento lieve e transitorio spiegabile (carico recente, sbrinamento in corso) con prodotto non compromesso e ripristino verificabile.",
            "non_conforme": "Temperature fuori limite non giustificate, prodotti deperibili mantenuti fuori regime termico, interruzioni evidenti della catena del freddo."
          },
          "note_template": null
        },
        {
          "id": "D-H05-003",
          "titolo": "Modalità di stoccaggio",
          "testo": "Lo stoccaggio è corretto: separazione alimenti/non alimenti, derrate sollevate da terra, prodotti protetti da contaminazioni, celle e frigoriferi ordinati e senza brina/ghiaccio eccessivi.",
          "categoria": "conservazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Stoccaggio ordinato e protetto; assenza di promiscuità a rischio.",
            "migliorabile": "Anomalie puntuali (imballo a terra, ghiaccio in formazione con prodotti protetti, ordine migliorabile).",
            "non_conforme": "Promiscuità a rischio (chimici con alimenti, cartoni in cella con prodotti nudi), prodotti non protetti sotto condense o brina, derrate a diretto contatto col suolo."
          },
          "note_template": null
        },
        {
          "id": "D-H05-004",
          "titolo": "Scadenze e rotazione",
          "testo": "Assenza di prodotti scaduti o con TMC superato; la rotazione segue il principio primo a scadere, primo a essere usato.",
          "categoria": "conservazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Nessun prodotto scaduto; rotazione applicata.",
            "migliorabile": "Singoli prodotti con TMC (termine minimo di conservazione) superato o rotazione non sistematica, senza prodotti a data di scadenza superata.",
            "non_conforme": "Anche un solo prodotto con data di scadenza superata detenuto senza segregazione e identificazione come non utilizzabile, o presenza diffusa di prodotti con TMC superato."
          },
          "note_template": null
        },
        {
          "id": "D-H05-005",
          "titolo": "Semilavorati e confezioni aperte",
          "testo": "Alimenti aperti, semilavorati e preparazioni anticipate sono protetti, identificati con denominazione e data (apertura o produzione) e utilizzati entro i tempi previsti dalle procedure.",
          "categoria": "conservazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Tutto identificato, protetto e nei tempi; etichette originali conservate per i prodotti travasati.",
            "migliorabile": "Identificazione incompleta su una parte limitata dei prodotti (manca la data ma il contenuto è riconoscibile e recente).",
            "non_conforme": "Semilavorati non protetti o non identificabili, o conservati oltre i tempi previsti."
          },
          "note_template": null
        },
        {
          "id": "D-H05-006",
          "titolo": "Decongelamento",
          "testo": "Il decongelamento è condotto secondo procedura (a regime refrigerato o modalità equivalenti previste), con prodotti identificati e liquidi di scongelamento gestiti.",
          "categoria": "processo",
          "applicabilita": "Solo se l'attività effettua decongelamento; altrimenti NA.",
          "guida": {
            "conforme": "Modalità conformi alla procedura, prodotti identificati con data di inizio, contenitori che separano il liquido.",
            "migliorabile": "Modalità corretta ma identificazione incompleta (manca la data di inizio su parte dei prodotti).",
            "non_conforme": "Decongelamento a temperatura ambiente o con modalità a rischio, prodotti non protetti, ricongelamento di prodotto scongelato."
          },
          "note_template": null
        },
        {
          "id": "D-H05-007",
          "titolo": "Abbattimento e raffreddamento post-cottura",
          "testo": "I prodotti cotti destinati alla conservazione sono raffreddati con abbattitore o modalità rapida equivalente prima del ricovero in frigorifero, secondo procedura.",
          "categoria": "processo",
          "applicabilita": "Solo se l'attività effettua preparazioni che richiedono raffreddamento e conservazione; altrimenti NA.",
          "guida": {
            "conforme": "Abbattitore funzionante e utilizzato, o modalità rapida documentata; nessun prodotto caldo in cella.",
            "migliorabile": "Prassi corretta ma non registrata dove il piano lo prevede; episodio isolato gestito (guasto con richiesta di intervento documentata).",
            "non_conforme": "Raffreddamento sistematico in cella di prodotti caldi, abbattitore fuori uso senza alternative con produzione invariata."
          },
          "note_template": null
        },
        {
          "id": "D-H05-008",
          "titolo": "MOCA (materiali a contatto con alimenti)",
          "testo": "I MOCA sono idonei all'uso previsto, stoccati protetti e sollevati da terra, con confezioni richiuse dopo l'uso parziale e senza riutilizzi impropri.",
          "categoria": "conservazione",
          "applicabilita": null,
          "guida": {
            "conforme": "Stoccaggio protetto, materiali idonei anche per alimenti caldi/grassi dove serve, tracciabilità di acquisto disponibile.",
            "migliorabile": "Stoccaggio parzialmente scoperto (confezioni aperte non richiuse) in contesti a basso rischio.",
            "non_conforme": "Uso di materiali non idonei al contatto o riutilizzo di contenitori impropri (imballi primari riciclati) per alimenti."
          },
          "note_template": null
        },
        {
          "id": "D-H05-009",
          "titolo": "Trasporto e consegna di alimenti",
          "testo": "Gli alimenti trasportati o consegnati (asporto, delivery, catering, consegne a terzi) sono protetti e mantenuti alle temperature previste, con contenitori e mezzi idonei e puliti.",
          "categoria": "processo",
          "applicabilita": "Solo se l'attività effettua asporto, delivery, catering o consegna di alimenti; altrimenti NA.",
          "guida": {
            "conforme": "Contenitori isotermici o attrezzature idonee, pulite e dedicate; tempi e temperature compatibili con i prodotti; evidenza di controlli ove previsti dal piano.",
            "migliorabile": "Attrezzature idonee ma gestione non formalizzata (nessuna registrazione ove prevista, contenitori usurati ma puliti); tempi brevi che contengono il rischio.",
            "non_conforme": "Alimenti deperibili trasportati senza alcun mantenimento termico su tempi significativi, contenitori inadeguati o in condizioni igieniche inaccettabili, promiscuità a rischio nel trasporto."
          },
          "note_template": null
        }
      ]
    },
    {
      "id": "SEZ-H06",
      "titolo": "Rintracciabilità, etichettatura e gestione non conformità",
      "categoria_prevalente": "rintracciabilità",
      "domande": [
        {
          "id": "D-H06-001",
          "titolo": "Rintracciabilità a monte",
          "testo": "I documenti di acquisto (DDT, fatture) sono disponibili e consentono di risalire ai fornitori dei prodotti presenti; prova pratica su un prodotto a campione.",
          "categoria": "rintracciabilità",
          "applicabilita": null,
          "guida": {
            "conforme": "Prova a campione superata in tempi ragionevoli.",
            "migliorabile": "Documenti presenti ma archiviazione disordinata; risalita possibile ma laboriosa, o lacune su ingredienti minori.",
            "non_conforme": "Impossibile risalire alla provenienza di prodotti in uso, o presenza di merce senza alcun documento di accompagnamento."
          },
          "note_template": null
        },
        {
          "id": "D-H06-002",
          "titolo": "Identificazione dei prodotti in stoccaggio",
          "testo": "I prodotti in stoccaggio sono identificabili tramite etichetta originale o registrazione equivalente (lotto, fornitore, scadenza).",
          "categoria": "rintracciabilità",
          "applicabilita": null,
          "guida": {
            "conforme": "Tutti i prodotti verificati identificabili.",
            "migliorabile": "Etichette conservate in modo disordinato o parte limitata dei prodotti di difficile ricollegamento.",
            "non_conforme": "Quota rilevante di prodotti non identificabili, o prodotti sfusi privi di qualunque riferimento."
          },
          "note_template": null
        },
        {
          "id": "D-H06-003",
          "titolo": "Etichettatura delle preparazioni proprie",
          "testo": "I prodotti preparati o confezionati in loco destinati alla vendita riportano le informazioni obbligatorie corrette (denominazione, ingredienti/allergeni, date, modalità di conservazione).",
          "categoria": "rintracciabilità",
          "applicabilita": "Solo se l'attività confeziona/etichetta prodotti propri; altrimenti NA.",
          "guida": {
            "conforme": "Etichette complete e corrette sulle referenze verificate.",
            "migliorabile": "Lacune sporadiche su elementi non di sicurezza (peso, prezzo, formattazione).",
            "non_conforme": "Informazione allergeni mancante o errata anche su una sola referenza; assenza sistematica di elementi obbligatori."
          },
          "note_template": null
        },
        {
          "id": "D-H06-004",
          "titolo": "Prodotti non conformi",
          "testo": "I prodotti non conformi (scaduti, danneggiati, in attesa di reso) sono segregati e identificati, in attesa di smaltimento o restituzione.",
          "categoria": "rintracciabilità",
          "applicabilita": null,
          "guida": {
            "conforme": "Area/contenitore dedicato, identificato, separato dai prodotti destinati all'uso.",
            "migliorabile": "Separazione di fatto presente ma identificazione incompleta o cartello mancante.",
            "non_conforme": "Prodotti non conformi frammisti a quelli destinati all'uso o alla vendita."
          },
          "note_template": null
        },
        {
          "id": "D-H06-005",
          "titolo": "Ritiri e richiami: prova pratica",
          "testo": "Alla richiesta diretta, il referente sa descrivere concretamente la gestione di un richiamo: come riceve l'allerta, come blocca il prodotto coinvolto, come verifica le giacenze e come documenta l'azione svolta.",
          "categoria": "rintracciabilità",
          "applicabilita": null,
          "guida": {
            "conforme": "Il referente descrive con sicurezza tutti e quattro i passaggi (ricezione, blocco, verifica giacenze, documentazione) e nessun prodotto richiamato risulta in uso.",
            "migliorabile": "Descrizione parziale ma sostanza corretta: saprebbe agire, la formalizzazione o la documentazione dell'azione è debole.",
            "non_conforme": "Nessuna consapevolezza del tema, incapacità di descrivere come bloccherebbe un prodotto, o prodotto oggetto di richiamo trovato in uso/vendita."
          },
          "note_template": null
        }
      ]
    },
    {
      "id": "SEZ-H07",
      "titolo": "Igiene e comportamento del personale",
      "categoria_prevalente": "personale",
      "domande": [
        {
          "id": "D-H07-001",
          "titolo": "Abbigliamento da lavoro",
          "testo": "Il personale indossa abbigliamento da lavoro idoneo, pulito e completo, con copricapo indossato correttamente dove previsto.",
          "categoria": "personale",
          "applicabilita": null,
          "guida": {
            "conforme": "Divise idonee e pulite in relazione all'attività in corso.",
            "migliorabile": "Lacune isolate e lievi (copricapo indossato male, divisa segnata dal lavoro della giornata).",
            "non_conforme": "Indumenti in condizioni igieniche inadeguate, abiti civili in lavorazione, assenza sistematica del copricapo dove previsto."
          },
          "note_template": null
        },
        {
          "id": "D-H07-002",
          "titolo": "Comportamenti igienici",
          "testo": "I comportamenti osservati rispettano le buone prassi: lavaggio mani nelle occasioni previste, gestione corretta dei guanti, assenza di monili/orologi/unghie ricostruite in lavorazione, niente cibi o fumo nelle aree di lavoro.",
          "categoria": "personale",
          "applicabilita": null,
          "guida": {
            "conforme": "Comportamenti corretti nelle osservazioni effettuate.",
            "migliorabile": "Scostamenti isolati e non critici (asciugatura mani sulla divisa, guanto non cambiato dopo operazione a basso rischio).",
            "non_conforme": "Comportamenti a rischio frequenti o diffusi, o anche un solo caso critico (monili in lavorazione diretta, mancato lavaggio dopo operazione contaminante)."
          },
          "note_template": null
        },
        {
          "id": "D-H07-003",
          "titolo": "Protezione di ferite e stati che richiedono cautela",
          "testo": "Eventuali ferite alle mani sono protette e coperte da guanto; il personale sa che stati sintomatici rilevanti vanno segnalati al responsabile.",
          "categoria": "personale",
          "applicabilita": null,
          "guida": {
            "conforme": "Ferite correttamente protette; consapevolezza sul dovere di segnalazione.",
            "migliorabile": "Protezione presente ma imperfetta (cerotto idoneo senza guanto in mansione a basso rischio).",
            "non_conforme": "Ferite esposte in manipolazione alimenti."
          },
          "note_template": null
        },
        {
          "id": "D-H07-004",
          "titolo": "Effetti personali",
          "testo": "Gli effetti personali e gli abiti civili sono custoditi negli spazi dedicati e non entrano nelle aree di lavorazione.",
          "categoria": "personale",
          "applicabilita": null,
          "guida": {
            "conforme": "Effetti personali negli armadietti/spazi dedicati.",
            "migliorabile": "Presenza puntuale di oggetti personali in area operativa ma lontani da alimenti e postazioni attive.",
            "non_conforme": "Effetti personali diffusi nelle aree di lavorazione o a contatto con superfici/materiali alimentari."
          },
          "note_template": null
        }
      ]
    },
    {
      "id": "SEZ-H08",
      "titolo": "Controllo infestanti",
      "categoria_prevalente": "infestanti",
      "domande": [
        {
          "id": "D-H08-001",
          "titolo": "Piano di controllo infestanti",
          "testo": "È attivo un piano di monitoraggio e lotta agli infestanti, affidato a ditta specializzata o gestito internamente in modo documentato.",
          "categoria": "infestanti",
          "applicabilita": null,
          "guida": {
            "conforme": "Piano attivo, contratto o procedura interna in corso di validità, interventi con frequenza adeguata.",
            "migliorabile": "Attività di fatto svolta ma con lacune contrattuali/documentali (contratto scaduto da rinnovare, intestazione non aggiornata).",
            "non_conforme": "Nessun piano attivo e nessuna evidenza di monitoraggio."
          },
          "note_template": null
        },
        {
          "id": "D-H08-002",
          "titolo": "Documentazione pest control",
          "testo": "La documentazione del pest control è completa: planimetria delle postazioni, rapporti degli interventi, schede tecniche e di sicurezza dei prodotti utilizzati.",
          "categoria": "infestanti",
          "applicabilita": null,
          "guida": {
            "conforme": "Documentazione completa, planimetria corrispondente alle postazioni reali, rapporti disponibili.",
            "migliorabile": "Lacune parziali (planimetria da aggiornare, singoli rapporti mancanti, postazione non corrispondente).",
            "non_conforme": "Documentazione assente, o segnalazioni della ditta ripetutamente ignorate senza presa in carico."
          },
          "note_template": null
        },
        {
          "id": "D-H08-003",
          "titolo": "Assenza di infestanti",
          "testo": "Nei locali non si osservano infestanti né loro tracce (escrementi, bave, ragnatele estese, danni da roditori).",
          "categoria": "infestanti",
          "applicabilita": null,
          "guida": {
            "conforme": "Nessuna traccia osservata; postazioni di monitoraggio integre e in sede.",
            "migliorabile": "Elementi puntuali del sistema fuori posto (trappola spostata, lampada scollegata) senza tracce di infestazione.",
            "non_conforme": "Infestazione in atto o tracce evidenti, o uso di insetticidi fuori piano nelle aree alimentari."
          },
          "note_template": null
        },
        {
          "id": "D-H08-004",
          "titolo": "Barriere fisiche",
          "testo": "Le barriere fisiche contro l'ingresso di infestanti sono presenti e integre: retine alle aperture verso l'esterno, porte con chiusura efficace, protezioni su varchi tecnici.",
          "categoria": "infestanti",
          "applicabilita": null,
          "guida": {
            "conforme": "Aperture verso l'esterno protette o non apribili; porte tenute chiuse fuori dalle operazioni di carico/scarico.",
            "migliorabile": "Protezioni assenti o danneggiate su aperture lontane dalle aree con alimenti non protetti.",
            "non_conforme": "Aperture non protette in aree di lavorazione o con alimenti esposti, porte verso l'esterno sistematicamente aperte senza barriere."
          },
          "note_template": null
        }
      ]
    }
  ]
}$haccp_json$::jsonb,
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
