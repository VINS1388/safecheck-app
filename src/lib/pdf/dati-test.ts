import type { DatiVerbale } from "@/types/verbale";

// Dati fittizi che simulano un sopralluogo completo.
// Usati per lo spike della pipeline PDF (nessun database).
// I conteggi per sezione e i totali sono pre-calcolati per coerenza
// con quanto reso a video dai componenti PDF.
export const datiTest: DatiVerbale = {
  numero_verbale: "VRB-2026-001",
  data_visita: "29 giugno 2026",
  data_generazione: "29/06/2026",
  cliente: "Studio Bilello Srl",
  sede: "Sede Principale",
  indirizzo: "Via Roma 1, 00100 Roma",
  referente_cliente: "Paolo Sacco",
  tecnico: "Mario Rossi",
  qualifica: "RSPP",
  ora_inizio: "09:30",
  note_conclusive:
    "Sopralluogo svolto regolarmente con la collaborazione del referente. " +
    "Si raccomanda di dare seguito alle azioni correttive indicate per le " +
    "non conformità rilevate entro i termini concordati.",
  sezioni: [
    {
      id: "SEZ-01",
      nome: "SEZ-01 — Organizzazione e documentazione",
      conteggi: { C: 2, PC: 1, NC: 1, NV: 1, NA: 0 },
      risposte: [
        {
          domanda_id: "Q-01-01",
          testo_domanda:
            "È presente e aggiornato il Documento di Valutazione dei Rischi (DVR)?",
          esito: "C",
          osservazioni: "DVR aggiornato a marzo 2026, firmato dal datore di lavoro.",
          azione_correttiva: "",
          nominativi: "Paolo Sacco",
        },
        {
          domanda_id: "Q-01-02",
          testo_domanda:
            "È stato nominato il Responsabile del Servizio Prevenzione e Protezione (RSPP)?",
          esito: "C",
          osservazioni: "Nomina formalizzata e accettata.",
          azione_correttiva: "",
          nominativi: "Mario Rossi",
        },
        {
          domanda_id: "Q-01-03",
          testo_domanda:
            "Sono designati gli addetti alla gestione delle emergenze e al primo soccorso?",
          esito: "PC",
          osservazioni:
            "Designati gli addetti antincendio, mancano due addetti al primo soccorso.",
          azione_correttiva:
            "Designare e formare due ulteriori addetti al primo soccorso entro 60 giorni.",
          nominativi: "Luigi Bianchi, Anna Verdi",
        },
        {
          domanda_id: "Q-01-04",
          testo_domanda:
            "Sono tracciati e documentati i corsi di formazione obbligatori dei lavoratori?",
          esito: "NC",
          osservazioni:
            "Registro formazione incompleto: assenti gli attestati di 3 lavoratori.",
          azione_correttiva:
            "Completare il registro formazione e programmare i corsi mancanti entro 30 giorni.",
          nominativi: "",
        },
        {
          domanda_id: "Q-01-05",
          testo_domanda:
            "È disponibile il registro dei controlli periodici antincendio?",
          esito: "NV",
          osservazioni:
            "Registro non reperibile durante il sopralluogo, in possesso del consulente esterno.",
          azione_correttiva: "",
          nominativi: "",
        },
      ],
    },
    {
      id: "SEZ-02",
      nome: "SEZ-02 — Dispositivi di Protezione Individuale (DPI)",
      conteggi: { C: 2, PC: 0, NC: 1, NV: 0, NA: 1 },
      risposte: [
        {
          domanda_id: "Q-02-01",
          testo_domanda:
            "I DPI in dotazione sono adeguati ai rischi e conformi (marcatura CE)?",
          esito: "C",
          osservazioni: "DPI conformi e in buono stato di conservazione.",
          azione_correttiva: "",
          nominativi: "",
        },
        {
          domanda_id: "Q-02-02",
          testo_domanda:
            "È documentata la consegna dei DPI ai lavoratori con relativa firma?",
          esito: "NC",
          osservazioni: "Moduli di consegna non firmati per il reparto magazzino.",
          azione_correttiva:
            "Raccogliere le firme sui moduli di consegna DPI entro 15 giorni.",
          nominativi: "",
        },
        {
          domanda_id: "Q-02-03",
          testo_domanda:
            "I lavoratori sono stati formati sull'uso corretto dei DPI?",
          esito: "C",
          osservazioni: "Formazione svolta e verbalizzata.",
          azione_correttiva: "",
          nominativi: "",
        },
        {
          domanda_id: "Q-02-04",
          testo_domanda:
            "Sono presenti DPI di terza categoria (anticaduta) ove richiesto?",
          esito: "NA",
          osservazioni: "Nessuna lavorazione in quota presente nella sede.",
          azione_correttiva: "",
          nominativi: "",
        },
      ],
    },
    {
      id: "SEZ-03",
      nome: "SEZ-03 — Impianti e attrezzature",
      conteggi: { C: 3, PC: 1, NC: 1, NV: 0, NA: 0 },
      risposte: [
        {
          domanda_id: "Q-03-01",
          testo_domanda:
            "L'impianto elettrico è dotato di dichiarazione di conformità?",
          esito: "C",
          osservazioni: "Dichiarazione di conformità presente e conforme.",
          azione_correttiva: "",
          nominativi: "",
        },
        {
          domanda_id: "Q-03-02",
          testo_domanda:
            "Sono effettuate le verifiche periodiche dell'impianto di messa a terra?",
          esito: "PC",
          osservazioni:
            "Ultima verifica oltre il termine biennale di pochi mesi.",
          azione_correttiva:
            "Programmare la verifica periodica di messa a terra entro 30 giorni.",
          nominativi: "",
        },
        {
          domanda_id: "Q-03-03",
          testo_domanda:
            "Le attrezzature di lavoro sono sottoposte a manutenzione documentata?",
          esito: "C",
          osservazioni: "Registro manutenzioni aggiornato.",
          azione_correttiva: "",
          nominativi: "",
        },
        {
          domanda_id: "Q-03-04",
          testo_domanda:
            "Le vie di esodo e le uscite di emergenza sono libere e segnalate?",
          esito: "NC",
          osservazioni:
            "Uscita di emergenza secondaria ostruita da materiale di magazzino.",
          azione_correttiva:
            "Liberare immediatamente l'uscita di emergenza e ripristinare la segnaletica.",
          nominativi: "",
        },
        {
          domanda_id: "Q-03-05",
          testo_domanda:
            "Gli estintori sono presenti, segnalati e revisionati?",
          esito: "C",
          osservazioni: "Estintori revisionati e con cartellonistica conforme.",
          azione_correttiva: "",
          nominativi: "",
        },
      ],
    },
  ],
  totali: {
    C: 7,
    PC: 2,
    NC: 3,
    NV: 1,
    NA: 1,
    verificati: 13,
  },
};
