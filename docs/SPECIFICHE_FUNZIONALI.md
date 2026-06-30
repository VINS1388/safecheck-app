# SPECIFICHE FUNZIONALI — SafeCheck

Documento vivo. Aggiornato ad ogni sessione di design su Claude.ai.
Fonte di verità per tutte le decisioni di prodotto.

---

## Indice

1. [Panoramica prodotto](#1-panoramica-prodotto)
2. [Roadmap per fasi](#2-roadmap-per-fasi)
3. [Struttura checklist](#3-struttura-checklist)
4. [Ciclo di vita del verbale](#4-ciclo-di-vita-del-verbale)
5. [Archivio verbali per azienda](#5-archivio-verbali-per-azienda)
6. [Generazione PDF verbale](#6-generazione-pdf-verbale)
7. [Anagrafica clienti](#7-anagrafica-clienti)
8. [Autenticazione e sicurezza](#8-autenticazione-e-sicurezza)
9. [Stack tecnico](#9-stack-tecnico)
10. [Sprint 9.1 — Multi-impresa SEZ-08](#10-sprint-91--multi-impresa-sez-08)
11. [Decisioni aperte](#11-decisioni-aperte)

---

## 1. Panoramica prodotto

**SafeCheck** è una web app mobile-first per la conduzione e documentazione di sopralluoghi
di sicurezza sul lavoro, destinata a consulenti RSPP italiani (D.Lgs. 81/2008).

**Stato: in produzione.** Go-live con cliente reale (Pane Pizza Srl) completato il 30 giugno 2026.

### Problema risolto
Il flusso precedente prevedeva compilazione manuale su carta o Excel in campo, seguita da
rework completo in ufficio per produrre il verbale PDF. SafeCheck elimina il rework: il
tecnico inserisce i dati una sola volta in campo e il sistema genera automaticamente il
verbale professionale.

### Utenti target
- Consulenti RSPP / studi di consulenza sicurezza
- Tecnici che effettuano sopralluoghi in aziende clienti
- (Futuro, Sprint 17) Aziende clienti che accedono ai propri verbali in sola lettura

### Quadro normativo
D.Lgs. 81/2008 (Testo Unico Sicurezza sul Lavoro) e successive modifiche, incluso Art. 26
(obblighi connessi ai contratti d'appalto/d'opera/somministrazione) da Sprint 9.

### Relazione con Safety Risk Suite 2.0

SafeCheck è progettato fin dall'origine sia come prodotto standalone sia come futuro modulo
di audit di campo di **Safety Risk Suite 2.0**, la piattaforma madre per consulenti RSPP
(motore di reasoning sulla compliance, non semplice registro dati). L'integrazione è
pianificata per Sprint 18+, come progetto separato con Supabase project proprio: comunicazione
esclusivamente via API tramite contratti `SiteContext` / `AuditResult` (definiti, non ancora
implementati). Nessuna integrazione diretta nel frattempo.

---

## 2. Roadmap per fasi

### Fase 0 — Fondamenta ✅ Completata
- Documentazione baseline
- PDF spike con PDFKit — viabilità confermata
- Template JSON canonico iniziale (52 domande, 7 sezioni)
- Repo GitHub inizializzato

### Fase 1 — MVP-A ✅ Archiviata
Single-file PWA su GitHub Pages (github.com/VINS1388/safecheck). Non più sviluppata.
Usare solo come riferimento storico, non come base di lavoro.

### Fase 2 — MVP-B (safecheck-app) ✅ In produzione

**Stack:** Next.js 14 App Router, Supabase, Prisma, Vercel, PDFKit server-side
**Deploy:** https://safecheck-app-tau.vercel.app

| Sprint | Contenuto | Stato |
|---|---|---|
| Sprint 0 | Scaffolding Next.js, Vercel, Supabase link | ✅ Completato |
| Sprint 1 | Schema DB, 12 tabelle, 4 enum, RLS | ✅ Completato |
| Sprint 2 | Seed 52 domande, RLS 28 policy, tipi TypeScript | ✅ Completato |
| Sprint 3 | Auth Supabase, login/logout, layout dashboard, trigger new user | ✅ Completato |
| Sprint 4 | CRUD clienti e sedi, componenti UI base | ✅ Completato |
| Sprint 5 | Compilazione checklist in campo, persistenza Supabase | ✅ Completato |
| Sprint 6 | Generazione PDF server-side, numerazione RPC atomica | ✅ Completato |
| Sprint 7 | Schermata avvio sopralluogo, nominativi SEZ-01, mobile-first | ✅ Completato |
| Sprint 7-FIX | Default obbligatori, riscrittura domande (52→55), campo descrizione | ✅ Completato |
| Sprint 8 | Campi testo espandibili, fix layout PDF | ✅ Completato |
| PRE-GOLIVE | Cliente reale "Pane Pizza Srl", verifica end-to-end | ✅ Completato |
| **GO-LIVE** | **Produzione attiva** | ✅ **30/06/2026** |
| Sprint 9 | SEZ-08 Art. 26 Appalti/DUVRI — motore logica condizionale di sezione | ✅ Completato |
| **Sprint 9.1** | **Multi-impresa SEZ-08** | 🔄 In progettazione |
| Sprint 10 | CRUD completo clienti/sedi, UI refinement, dashboard reale | ⏳ Pianificato |
| Sprint 11 | Duplica e Crea sostitutivo (genealogia verbali) | ⏳ Pianificato |

### Fase 3 — Prodotto maturo (post periodo pilota) 🔮

| Sprint | Contenuto |
|---|---|
| Sprint 12 | Motore checklist evoluto: nominativi dinamici per domanda, scadenze automatiche da data verifica |
| Sprint 13 | NC tracking: scadenze azioni correttive, solleciti automatici via Resend |
| Sprint 14 | Pianificazione visite: contratto N visite/anno per sede, alert scadenze; evoluzione verso menu "Pianificazione" centralizzato con assegnazione tecnico (riflette il reparto pianificazione reale dello Studio) |
| Sprint 15 | Sopralluogo planimetrico (stile PlanRadar — pin su planimetria, modulo separato dal verbale checklist) |
| Sprint 16 | Template HACCP — scoring 0/0.5/1/A, checklist combinata (rif. file originale Alice Pizza/Pane Pizza) |
| Sprint 17 | Client portal (sola lettura per aziende clienti) e firma digitale |

Altre funzionalità Fase 3 non ancora schedulate in sprint specifico:
- Dashboard analytics (KPI per cliente, trend NC, macroaree critiche)
- Allegati fotografici per NC specifiche
- Multi-tenancy (più studi di consulenza)
- Template builder UI (checklist custom)

### Fase 4 — Top di mercato 🚀 Premium (oltre la roadmap attuale)

- Sprint 18+: Integrazione SafeCheck ↔ Safety Risk Suite 2.0 (vedi sezione 1)
- AI suggerimenti azioni correttive (basato su storico + riferimenti normativi)
- Report comparativi tra sopralluoghi (delta NC, miglioramenti nel tempo)
- Verbali multilingua (EN/DE per aziende multinazionali)
- Audit trail completo e immutabile (prova in ispezioni ASL/INL)
- Integrazione DVR digitali

### Verticale attuale e predisposizione template futuri

SafeCheck nasce con il verticale **sopralluoghi sicurezza sul lavoro (D.Lgs. 81/2008)**.
È l'unico verticale implementato fino a Sprint 16 (HACCP).

L'architettura è predisposta per template futuri tramite le tabelle
`template_master` / `template_cliente` / `template_sede` già presenti nello schema DB,
con sistema di versionamento (vedi `template_master` versione 3, introdotta Sprint 9)
e snapshot immutabile per visita.

**Regola:** non implementare HACCP né altri template prima di Sprint 16. Non modificare
la checklist canonica delle domande sicurezza senza istruzione esplicita.

---

## 3. Struttura checklist

### Sezioni operative (8 totali, dopo Sprint 9)

| ID | Titolo | N. domande | Note |
|---|---|---|---|
| SEZ-01 | Nominativi figure della sicurezza | 13 | 9 figure nominate |
| SEZ-02 | Documentazione obbligatoria | 7 | Registro infortuni ESCLUSO (D.Lgs. 151/2015) |
| SEZ-03 | Formazione | 10 | Una domanda per figura, verifica olistica |
| SEZ-04 | Sorveglianza sanitaria | 7 | |
| SEZ-05 | DPI — Dispositivi di protezione individuale | 7 | |
| SEZ-06 | Emergenze e primo soccorso | 6 | |
| SEZ-07 | Ambienti di lavoro e attrezzature | 5 | |
| SEZ-08 | Appalti e contratti d'opera (Art. 26 / DUVRI) | 9 | Prima sezione con logica condizionale — vedi 3b |

**Totale domande:** 64 (verificato post migration 011, Sprint 9).
**Versione template_master:** 3.

### Tipi di risposta

| Codice | Significato |
|---|---|
| C | Conforme |
| PC | Parzialmente conforme |
| NC | Non conforme |
| NV | Non valutabile |
| NA | Non applicabile |

Il campo `azione_correttiva` è visibile e obbligatorio SOLO per risposte NC o PC.

Tipi di risposta alternativi (0 / 0.5 / 1 / A) sono riservati al futuro template HACCP
(Sprint 16) e non si applicano alla checklist sicurezza standard.

### SEZ-01 — Figure della sicurezza

| Figura | Tipo campo |
|---|---|
| DL — Datore di Lavoro | Singolo valore |
| RSPP — Resp. Servizio Prevenzione | Singolo valore |
| ASPP | Multi-tag |
| MC — Medico Competente | Multi-tag |
| RLS — Rappresentante Lavoratori | Multi-tag |
| Addetti Antincendio | Multi-tag |
| Addetti Primo Soccorso | Multi-tag |
| Preposti | Multi-tag |
| Dirigenti | Multi-tag |

### SEZ-03 — Formazione (ordine gerarchico)

1. Lavoratori
2. Preposti
3. Dirigenti
4. DL
5. DL-SPP
6. RSPP
7. ASPP
8. RLS
9. Addetti Antincendio
10. Addetti Primo Soccorso

La formazione è verificata **olistica per figura** (formazione + aggiornamento insieme),
non come domande separate.

### 3b. SEZ-08 — Appalti e contratti d'opera (Art. 26 / DUVRI) — Sprint 9

**Introduce la prima logica condizionale a livello di sezione** in SafeCheck.

**Domanda filtro:** D-08-001 "Presenza di appalti, contratti d'opera o di somministrazione".

**Comportamento:**
- Esito **NA** su D-08-001 → la sezione si **collassa**: le domande D-08-002...D-08-009
  non vengono mostrate in UI, non contano ai fini della completezza del verbale, e non
  vengono stampate nel PDF (si stampa solo titolo sezione + domanda filtro).
- Qualunque altro esito (**C / PC / NC / NV**) → la sezione si **espande**: tutte le 8
  domande diventano obbligatorie per la chiusura del verbale.

**Significato degli esiti sulla domanda filtro:**
- `C` = appalti presenti e gestiti correttamente
- `PC` / `NC` = appalti presenti con criticità (richiede azione correttiva, logica standard)
- `NV` = appalti presenti, non valutato
- `NA` = nessun appalto presente → unico valore che collassa la sezione

**Motore di collasso (riusabile):** centralizzato in `completa.ts` tramite
`VALORE_FILTRO_COLLASSO` e gli helper `sezioneCollassata()` / `domandaAttiva()`. Riusato
identico da UI, riepilogo conclusivo, route API di validazione, e generazione PDF.
Qualunque sezione condizionale futura deve riusare questo stesso motore, non duplicarlo.

**Conteggio NA nei rilievi conclusivi:** a sezione collassata, il conteggio NA per SEZ-08
è **1** (solo la domanda filtro), non 9. Rappresentazione onesta: le domande non attivate
non sono mai state valutate, quindi non vanno contate come 9 giudizi di non applicabilità.

**Campo D-08-003 (elenco imprese, implementazione transitoria Sprint 9):** persistito su
`risposte.osservazione_evidenza` come testo libero, sostituisce il textarea di osservazione
standard quando presente. **Da sostituire con modello strutturato — vedi sezione 10
(Sprint 9.1).**

### Campi interni (mai stampati nel PDF)

- `rif_normativo` — riferimento normativo della domanda
- `note_tecnico` — annotazioni interne del tecnico
- `correzione_default` — suggerimento precompilato azione correttiva
- `pdf_sha256` — hash integrità documento

### Campi speciali

- `note_finali_visita` — testo libero, appare in coda al verbale
- `rilievi_conclusivi` — composizione automatica: riepilogo NC + `note_finali_visita`
  (non è una sezione strutturata, è generata automaticamente)
- `campi_extra` — tipo TESTO_LIBERO, per sezioni aggiuntive non standard (es. D-08-003)

> ⚠️ `TESTO_LIBERO` NON è un `tipo_risposta` per le domande standard SEZ-01→SEZ-07.

### TODO tecnico non urgente — migrazione note_tecnico → descrizione

Solo 8 domande (SEZ-01/SEZ-06) sono state migrate dal campo `note_tecnico` al campo
`descrizione` (migration 009). Le restanti 47 domande del `template_master` mantengono
ancora il contenuto in `note_tecnico`, con fallback funzionante in `DomandaCard.tsx`
(`descrizione → note_tecnico`) che lascia però il modello dati incoerente. Da completare
in uno sprint di manutenzione post-pilota, non bloccante per la roadmap corrente.

---

## 4. Ciclo di vita del verbale

### Stati

```
bozza ──→ chiuso ──→ sostituito
```

### Tabella azioni per stato

| Stato | Azioni disponibili |
|---|---|
| `bozza` | **Continua** · Elimina |
| `chiuso` | Leggi · Scarica PDF · **Duplica** · **Crea sostitutivo** |
| `sostituito` | Leggi (sola lettura) · Scarica PDF |

> **Stato implementazione:** la macchina a stati e le regole sotto sono confermate e
> vincolanti. Duplica e Crea sostitutivo sono **pianificati per Sprint 11**, non ancora
> implementati in UI/API a oggi.

### Regole — CONFERMATA E NON DEROGABILE

- **Duplica** è disponibile SOLO da stato `chiuso`. MAI da `bozza`.
- **Crea sostitutivo** è disponibile SOLO da stato `chiuso`.
- Su `bozza` esiste SOLO l'azione **Continua** (più Elimina).
- Un verbale `chiuso` non può essere modificato direttamente.
- Un verbale `sostituito` è in sola lettura permanente.

### Comportamento Duplica

Scopo: creare un nuovo sopralluogo partendo da un verbale precedente come base.

- Deep clone completo del verbale sorgente:
  - ✅ Anagrafica azienda
  - ✅ Tutte le risposte C/PC/NC/NV/NA (incluse risposte multi-impresa SEZ-08 da Sprint 9.1)
  - ✅ Azioni correttive suggerite
- Campi resettati nella copia:
  - `id` → nuovo UUID
  - `data_visita` → data odierna
  - `stato` → `"bozza"`
  - `document_id` → nuovo SC-YYYY-NNN
  - `pdf_path` → null
- Campo genealogia: `derivato_da: <id_sorgente>`
- Il verbale originale NON cambia stato né dati.

### Comportamento Crea sostitutivo

Scopo: correggere un verbale già chiuso mantenendo traccia storica.

- Deep clone completo del verbale chiuso (stesse regole della Duplica)
- In aggiunta:
  - Il verbale originale → stato `"sostituito"`, acquisisce `sostituito_da: <nuovo_id>`
  - Il nuovo verbale → acquisisce `sostituisce: <id_originale>`, parte come `bozza`
- Il verbale sostituito resta visibile nell'archivio (visivamente degradato) e scaricabile.

### Struttura dati verbale

```json
{
  "id": "uuid-v4",
  "stato": "bozza | chiuso | sostituito",
  "document_id": "SC-YYYY-NNN",

  "genealogia": {
    "derivato_da": "uuid | null",
    "sostituisce": "uuid | null",
    "sostituito_da": "uuid | null"
  },

  "anagrafica": {
    "azienda": "",
    "sede": "",
    "piva": "",
    "data_visita": "ISO8601",
    "tecnico": ""
  },

  "template_snapshot": {},

  "risposte": {
    "SEZ-01": {},
    "SEZ-02": {},
    "SEZ-03": {},
    "SEZ-04": {},
    "SEZ-05": {},
    "SEZ-06": {},
    "SEZ-07": {},
    "SEZ-08": {}
  },

  "note_finali_visita": "",

  "meta": {
    "data_creazione": "ISO8601",
    "data_chiusura": "ISO8601 | null",
    "pdf_path": "bucket/private/SC-YYYY-NNN.pdf | null",
    "pdf_sha256": "interno, mai stampato"
  }
}
```

### Regole API — validazione server-side obbligatoria

```
POST /verbali/:id/duplica      → 403 se stato !== "chiuso"   (Sprint 11)
POST /verbali/:id/sostitutivo  → 403 se stato !== "chiuso"   (Sprint 11)
PATCH /verbali/:id             → 403 se stato !== "bozza"
DELETE /verbali/:id            → 403 se stato !== "bozza"
```

La validazione di stato è sempre server-side. Il frontend non è mai fonte di verità
per le regole di business critiche.

### Autenticazione nelle route API

Il middleware globale esclude `/api/*` dalla protezione automatica dei redirect.
Questo **non** significa che le route API sono pubbliche.

Ogni route API deve validare esplicitamente l'utente server-side prima di eseguire
qualsiasi operazione su dati, PDF, visite, verbali, duplicazioni, sostitutivi, download o delete.
Un utente non autenticato che raggiunge una route API deve ricevere `401 Unauthorized`.

Il frontend non è mai fonte di verità per permessi, stati o identità utente.

---

## 4b. Persistenza bozza — decisione Sprint 5 (confermata in produzione)

**Fonte di verità: Supabase.**
Ogni risposta compilata viene salvata in Supabase in tempo reale (autosave su ogni modifica).

`localStorage` è ammesso solo come cache temporanea di recupero UI, per evitare
la perdita di input non ancora inviati in caso di navigazione accidentale.
Non è e non deve diventare l'archivio principale delle risposte.

**Offline-first avanzato** (Service Worker, sync queue, conflict resolution)
resta in Fase 3/Fase 4 e non va anticipato.

---

## 5. Archivio verbali per azienda

### Vista scheda azienda

Ogni azienda ha una scheda dedicata con:

- **KPI sintetici in testa:**
  - Totale verbali
  - NC aperte (da tutti i verbali chiusi)
  - Data ultimo sopralluogo

- **Lista verbali** in ordine cronologico decrescente, con per ciascuno:
  - Data sopralluogo
  - Document ID (SC-YYYY-NNN)
  - Numero NC rilevate
  - Badge stato (Bozza / Chiuso / Sostituito)
  - Azioni contestuali in base allo stato

> CRUD completo clienti/sedi + dashboard reale con questi KPI: pianificato Sprint 10.
> Lo stato attuale (post Sprint 4) copre CRUD base.

### Azioni contestuali per stato

**Bozza:**
- `Continua` (primaria) — riapre la compilazione
- `Elimina`

**Chiuso:**
- `Duplica` — crea nuovo sopralluogo ereditando tutto (Sprint 11)
- `Sostitutivo` — avvia flusso correzione (Sprint 11)
- `Scarica PDF` (primaria)
- `Leggi` — vista dettaglio sola lettura

**Sostituito:**
- `Leggi` — sola lettura, visivamente degradato
- `Scarica PDF`
- NON mostrare Duplica né Sostitutivo

### Accesso futuro per le aziende clienti (Sprint 17)

Le aziende clienti potranno accedere al proprio portale per:
- Visualizzare i propri verbali in sola lettura
- Scaricare i PDF
- Vedere lo stato delle NC aperte

Scope: Sprint 17 — non anticipare.

### Pianificazione visite (Sprint 14, post pilota)

Per ogni sede del cliente, blocco contratto con numero visite/anno previste
(1, 2, 3, 4+). Il sistema calcola automaticamente le scadenze delle visite
pianificate e genera alert per visite in scadenza/da effettuare. Evoluzione
successiva: menu "Pianificazione" centralizzato con vista di tutte le attività
da pianificare e assegnare ai tecnici (riflette il reparto pianificazione reale
dello Studio Bilello). Da progettare con calendario, assegnazione tecnico, stati
pianificazione. Non anticipare prima di Sprint 14.

---

## 6. Generazione PDF verbale

### Principi fondamentali

- Generazione **server-side** con PDFKit (Node.js) — mai client-side
- PDF **immutabile** una volta generato
- Storage in **bucket privato** Supabase
- Download esclusivamente tramite **route autenticata**
- Mai URL pubblici per i PDF

### Struttura del verbale PDF

1. **Copertina / Anagrafica** — entity-level data block (non è una sezione SEZ)
   - Ragione sociale, sede, P.IVA
   - Data sopralluogo, tecnico
   - Document ID, numero verbale
   - Logo Studio

2. **SEZ-01 → SEZ-08** — sezioni operative con risposte e azioni correttive
   - SEZ-08: se collassata, stampa solo titolo + domanda filtro; se espansa, stampa
     tutte le domande (dal Sprint 9.1: con sotto-sezione dedicata per ogni impresa)

3. **Rilievi conclusivi** — composizione automatica:
   - Tabella riepilogativa NC per sezione (conteggio NA su sezioni condizionali
     collassate = solo la domanda filtro, mai le domande non attivate)
   - `note_finali_visita` del tecnico

4. **Firme** — tecnico, eventualmente RSPP (Sprint 17)

### Campi che NON compaiono nel PDF

| Campo | Motivo |
|---|---|
| `rif_normativo` | Interno, uso tecnico |
| `note_tecnico` | Annotazioni private del tecnico |
| `correzione_default` | Solo suggerimento precompilato |
| `pdf_sha256` | Metadato integrità DB |

Nel PDF compare SOLO `correzione_suggerita_finale` — il testo confermato dal tecnico.

---

## 7. Anagrafica clienti

**Stato: implementato (CRUD base, Sprint 4).** CRUD completo + dashboard con KPI
reali pianificato Sprint 10.

Funzionalità attive:
- Creazione e gestione anagrafica aziende
- Associazione verbali all'azienda
- Ricerca e filtro aziende (base)

Funzionalità pianificate Sprint 10:
- Vista scheda azienda con archivio verbali e KPI sintetici completi (vedi sezione 5)
- UI refinement

---

## 8. Autenticazione e sicurezza

### Produzione

- **Provider:** Supabase Auth
- **Token:** JWT
- **RLS:** Row Level Security su tutte le tabelle Supabase
- PDF: download solo tramite route autenticata, mai URL pubblici

### Azione di sicurezza in sospeso

⚠️ Due Personal Access Token Supabase sono stati esposti in chiaro in chat durante
sessioni di sviluppo precedenti (prefissi `sbp_64fc8f…` e `sbp_78fcf1…`). Entrambi
devono essere ruotati se non ancora fatto. Regola permanente: mai passare PAT o
altre credenziali in chiaro in chat o a Claude Code — usare sempre variabili
d'ambiente.

### Futuro (Fase 3/Sprint 17+)

- Multi-tenancy: isolamento dati tra studi di consulenza diversi
- Client portal: accesso limitato aziende ai propri verbali (Sprint 17)
- Audit trail immutabile

### Privacy/GDPR

Priorità bassa, da affrontare in fase avanzata del progetto, non prima che la
roadmap funzionale sia sostanzialmente completa.

---

## 9. Stack tecnico

### Produzione (MVP-B)

| Componente | Tecnologia |
|---|---|
| Framework | Next.js 14 App Router |
| Database | Supabase + Prisma ORM |
| PDF | PDFKit (Node.js, server-side) |
| Storage | Supabase Storage (bucket privato) |
| Auth | Supabase Auth + JWT |
| Email | Resend |
| Deploy | Vercel (auto-deploy su push a `main`) |
| Dev env | Claude Code CLI |

### MVP-A (archiviato, riferimento storico)

| Componente | Tecnologia |
|---|---|
| UI | Vanilla JS + CSS nativo |
| Persistenza | localStorage |
| PDF | jsPDF (CDN, client-side) |
| Deploy | GitHub Pages |
| Repo | github.com/VINS1388/safecheck |

### Path locale sviluppo

```
F:\StudioBilello\2026\safecheck-app
```

### Direzione UI/UX (Sprint 7/8 e oltre)

SaaS tecnico premium, mobile-first:
- Sidebar: blu notte
- Background: grigio chiarissimo
- Cards: bianche, bordi sottili, radius morbido, shadow leggera
- Buttons: grandi, comodi per uso in campo
- Gerarchia visiva forte: cliente → sede → visita → checklist → verbale
- Colori stato: verde = conforme/chiuso · amber = parziale/attenzione ·
  rosso = NC/critico · grigio = NA/NV
- Checklist: intestazione visita sempre visibile, sezioni ben separate,
  bottoni C/PC/NC/NV/NA grandi e mobile-friendly
- No look "giocattolo", no colore eccessivo

---

## 10. Sprint 9.1 — Multi-impresa SEZ-08

**Stato: decisione architetturale confermata, in attesa di prompt esecutivo per
Claude Code. Non ancora implementato.**

### Problema

L'implementazione Sprint 9 di SEZ-08 tratta le 8 domande di controllo (D-08-002...
D-08-009: tesserini, DUVRI, idoneità tecnico-professionale, ecc.) come uniche per
l'intera sezione, con l'elenco delle imprese coinvolte relegato a un campo testo
libero (D-08-003). Nella realtà operativa possono essere presenti N imprese
appaltatrici/subappaltatrici/lavoratori autonomi (tipicamente 1, ma potenzialmente
6 o più), ciascuna con un proprio esito potenzialmente diverso sulle stesse 8
domande — es. tesserini regolari per l'impresa Alfa, ma DUVRI non firmato per
l'impresa Beta. Serve un modello che permetta **N risposte per la stessa domanda**,
una per impresa, cosa che lo schema dati attuale di SafeCheck non supporta (ogni
domanda standard ha esattamente una risposta per visita).

### Decisioni confermate

1. **Ripetizione completa.** Tutte le 8 domande di controllo si ripetono
   integralmente per ogni impresa inserita. Non esistono domande "uniche a
   livello sezione" tra le 8 — la filtro D-08-001 resta l'unica eccezione,
   sempre a livello di sezione.
2. **Dati anagrafici per impresa:** ragione sociale (testo) + tipo impresa
   (select: *appaltatrice* / *subappaltatrice* / *lavoratore autonomo*) — la
   distinzione di tipo ha rilevanza diretta sugli obblighi previsti dall'Art. 26.
3. **Cardinalità variabile, potenzialmente alta (6+).** La UI non può essere
   uno scroll lineare con tutte le domande di tutte le imprese in sequenza
   (impraticabile da campo su mobile con 48+ blocchi risposta). Pattern
   richiesto: **lista compatta** (ragione sociale + stato sintetico, es.
   "Alfa Impianti — 2 NC") che apre una **scheda dedicata per impresa** con le
   8 domande, coerente con l'impianto mobile-first del resto dell'app.
4. **PDF:** sotto-sezione dedicata e estesa per ciascuna impresa (non una
   tabella riassuntiva impresa × domanda).

### Architettura dati

- **Nuova tabella `imprese_appalto`**: `id`, `visita_id` (FK), `ragione_sociale`,
  `tipo_impresa` (enum: appaltatrice / subappaltatrice / lavoratore_autonomo),
  `ordine` (per mantenere l'ordine di inserimento in UI/PDF).
- **Nuova tabella `risposte_imprese_appalto`**: `id`, `impresa_id` (FK), `domanda_id`
  (FK alle domande D-08-002...D-08-009), `esito`, `osservazione`, `azione_correttiva`.
- **Decisione esplicita: non riusare `risposte` con una colonna `impresa_id`
  nullable.** Manterrebbe `risposte` semanticamente sporca (1 riga = 1 risposta
  standard di sezione, valida per il 100% dei casi tranne questo) per un caso
  isolato a SEZ-08. Tabella dedicata è la scelta più pulita.
- **Il motore di collasso/espansione di sezione (Sprint 9) resta invariato** e
  continua a governare la domanda filtro D-08-001. Cambia solo cosa viene
  renderizzato/validato quando la sezione è espansa: non più 8 domande singole,
  ma un contenitore "lista imprese" che genera N copie del blocco 8-domande.

### Impatto su completezza verbale

`completa.ts` va esteso così che, a sezione SEZ-08 espansa, la sezione risulti
completa quando: almeno 1 impresa è stata inserita **e** per ogni impresa
inserita tutte le 8 domande hanno risposta. Zero imprese inserite con sezione
espansa (filtro ≠ NA) = sezione incompleta, blocca la chiusura del verbale.

### Impatto su riepilogo e rilievi conclusivi

Il conteggio C/PC/NC/NV/NA nei rilievi conclusivi deve aggregare su tutte le
risposte di tutte le imprese (N × 8), mantenendo nel PDF il dettaglio per
impresa come da sotto-sezioni dedicate (vedi sopra). Il conteggio NA=1 per
sezione collassata (deciso in Sprint 9) resta invariato e si applica solo al
caso filtro=NA, indipendente dal numero di imprese (che in quel caso è zero).

### Pattern riusabile

Questo è il primo caso in SafeCheck di "blocco di domande ripetibile legato a
un'entità anagrafica creata dal tecnico in campo" — diverso dai nominativi
multi-tag di SEZ-01 (semplici liste di stringhe, senza domande associate a
ciascun nominativo). Va implementato con un minimo di generalità nel naming
delle tabelle, senza sovra-ingegnerizzare per casi d'uso futuri non ancora
richiesti (es. mezzi/attrezzature multiple, lavoratori autonomi con propria
idoneità — eventuali pattern simili futuri, non in scope ora).

### Sequenza di esecuzione

Il commit/push di Sprint 9 (motore di collasso, invariato) procede separato e
indipendente da questa estensione. Sprint 9.1 verrà eseguito come migration 012
in un giro dedicato successivo, con relativo prompt esecutivo completo per
Claude Code (schema, `completa.ts`, UI lista+scheda, PDF, riepilogo, piano di
test in-memory senza scrittura su DB di produzione).

---

## 11. Decisioni aperte

| # | Argomento | Contesto |
|---|---|---|
| D-01 | Firma digitale | Standard, provider, validità legale — Sprint 17 |
| D-02 | Trademark "SafeCheck" | Verifica disponibilità nome e dominio |
| D-03 | Piani di pricing | Struttura abbonamento per multi-tenancy |
| D-04 | Lingua UI | Solo italiano o anche inglese? |
| D-05 | Moduli add-on a pagamento | Risk assessment specifici (rumore, vibrazioni, chimico, MMC, stress, DSE, biologico, ROA/CEM, microclima) — orizzonte lungo, da definire dopo Sprint 16 |
| D-06 | Privacy/GDPR | Priorità bassa, da affrontare in fase avanzata — non ora |

---

*Documento creato: giugno 2025 — Ultimo aggiornamento: 30 giugno 2026 (DOC-ALIGN-02, post Sprint 9 / pre Sprint 9.1)*
*Da aggiornare ad ogni sessione di design SafeCheck su Claude.ai*
