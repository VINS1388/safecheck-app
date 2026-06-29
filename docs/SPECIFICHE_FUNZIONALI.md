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
10. [Decisioni aperte](#10-decisioni-aperte)

---

## 1. Panoramica prodotto

**SafeCheck** è una web app mobile-first per la conduzione e documentazione di sopralluoghi
di sicurezza sul lavoro, destinata a consulenti RSPP italiani (D.Lgs. 81/2008).

### Problema risolto
Il flusso attuale prevede: compilazione manuale su carta o Excel in campo → rework completo
in ufficio per produrre il verbale PDF. SafeCheck elimina il rework: il tecnico inserisce
i dati una sola volta in campo e il sistema genera automaticamente il verbale professionale.

### Utenti target
- Consulenti RSPP / studi di consulenza sicurezza
- Tecnici che effettuano sopralluoghi in aziende clienti
- (Futuro) Aziende clienti che accedono ai propri verbali in sola lettura

### Quadro normativo
D.Lgs. 81/2008 (Testo Unico Sicurezza sul Lavoro) e successive modifiche.

---

## 2. Roadmap per fasi

### Fase 0 — Fondamenta ✅ Completata
- Documentazione baseline (7 documenti fondativi)
- PDF spike con PDFKit — viabilità confermata
- Template JSON canonico (52 domande, 7 sezioni)
- Repo GitHub inizializzato

### Fase 1 — MVP-A ✅ Archiviata
Single-file PWA su GitHub Pages (github.com/VINS1388/safecheck). Non più sviluppata.
Usare solo come riferimento, non come base di lavoro.

### Fase 2 — MVP-B (safecheck-app) ⬤ In sviluppo
**Stack:** Next.js 14 App Router, Supabase, Prisma, Vercel, PDFKit server-side
**Deploy:** https://safecheck-app-tau.vercel.app

| Sprint | Contenuto | Stato |
|---|---|---|
| Sprint 0 | Scaffolding Next.js, Vercel, Supabase link | ✅ Completato |
| Sprint 1 | Schema DB, 12 tabelle, 4 enum, RLS | ✅ Completato |
| Sprint 2 | Seed 52 domande, RLS 28 policy, tipi TypeScript | ✅ Completato |
| Sprint 3 | Auth Supabase, login/logout, layout dashboard, trigger new user | ✅ Completato |
| Sprint 4 | CRUD clienti e sedi, componenti UI base (Button, Input, Card, Badge) | ✅ Completato |
| Sprint 5 | Compilazione checklist in campo | 🔄 In avvio |

**Sprint pianificati:**
- Sprint 6: generazione verbale PDF server-side
- Sprint 7: archivio verbali per azienda (stati, azioni contestuali, genealogia)
- Sprint 8: rifinitura, test end-to-end, go-live cliente

### Verticale attuale e predisposizione template futuri

SafeCheck nasce con il verticale **sopralluoghi sicurezza sul lavoro (D.Lgs. 81/2008)**.
È l'unico verticale implementato e l'unico su cui lavorare fino a istruzione esplicita contraria.

L'architettura è predisposta per template futuri tramite le tabelle
`template_master` / `template_cliente` / `template_sede` già presenti nello schema DB.
Questo consente di aggiungere in futuro template diversi (es. HACCP) senza modificare
l'architettura core.

**Regola:** non implementare HACCP né altri template ora. Non modificare la checklist
canonica delle 52 domande sicurezza senza istruzione esplicita.

### Fase 3 — Prodotto maturo 🔮 Futuro
- Sopralluogo planimetrico (modulo separato dal verbale checklist — vedi sezione dedicata)
- NC tracking con scadenze e stati (aperta/in corso/chiusa)
- Solleciti automatici via Resend
- Client portal (aziende clienti accedono ai propri verbali)
- Dashboard analytics (KPI per cliente, trend NC, macroaree critiche)
- Allegati fotografici per NC specifiche
- Firma digitale tecnico e RSPP
- Multi-tenancy (più studi di consulenza)
- Template builder UI (checklist custom — incluso futuro template HACCP)
- Offline-first avanzato (Service Worker + sync)
- Integrazione SafeCheck ↔ Safety Risk Suite 2.0 (contratti SiteContext/AuditResult)

### Fase 4 — Top di mercato 🚀 Premium
- AI suggerimenti azioni correttive (basato su storico + riferimenti normativi)
- Report comparativi tra sopralluoghi (delta NC, miglioramenti nel tempo)
- Pianificatore visite con scadenziario obbligatori
- Verbali multilingua (EN/DE per aziende multinazionali)
- Audit trail completo e immutabile (prova in ispezioni ASL/INL)
- Integrazione DVR digitali

---

## 3. Struttura checklist

### Sezioni operative (7 totali)

| ID | Titolo | Note |
|---|---|---|
| SEZ-01 | Nominativi figure della sicurezza | 9 figure nominate |
| SEZ-02 | Documentazione obbligatoria | Registro infortuni ESCLUSO (D.Lgs. 151/2015) |
| SEZ-03 | Formazione | 10 domande per figura di sicurezza |
| SEZ-04 | Sorveglianza sanitaria | Da finalizzare |
| SEZ-05 | DPI — Dispositivi di protezione individuale | Da finalizzare |
| SEZ-06 | Emergenze e primo soccorso | Da finalizzare |
| SEZ-07 | Ambienti di lavoro e attrezzature | Da finalizzare |

**Totale domande:** 52 (verificate nel seed Sprint 2)

### Tipi di risposta

| Codice | Significato |
|---|---|
| C | Conforme |
| PC | Parzialmente conforme |
| NC | Non conforme |
| NV | Non valutabile |
| NA | Non applicabile |

Il campo `azione_correttiva` è visibile e obbligatorio SOLO per risposte NC o PC.

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

### Campi interni (mai stampati nel PDF)

- `rif_normativo` — riferimento normativo della domanda
- `note_tecnico` — annotazioni interne del tecnico
- `correzione_default` — suggerimento precompilato azione correttiva
- `pdf_sha256` — hash integrità documento

### Campi speciali

- `note_finali_visita` — testo libero, appare in coda al verbale
- `rilievi_conclusivi` — composizione automatica: riepilogo NC + `note_finali_visita`
  (non è una sezione strutturata, è generata automaticamente)
- `campi_extra` — tipo TESTO_LIBERO, per sezioni aggiuntive non standard

> ⚠️ `TESTO_LIBERO` NON è un `tipo_risposta` per le 52 domande principali.

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
  - ✅ Tutte le risposte C/PC/NC/NV/NA
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
    "SEZ-07": {}
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

### Regole API (MVP-B) — validazione server-side obbligatoria

```
POST /verbali/:id/duplica      → 403 se stato !== "chiuso"
POST /verbali/:id/sostitutivo  → 403 se stato !== "chiuso"
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

## 4b. Persistenza bozza — decisione Sprint 5

**Fonte di verità: Supabase.**
Ogni risposta compilata viene salvata in Supabase in tempo reale (autosave su ogni modifica).

`localStorage` è ammesso solo come cache temporanea di recupero UI, per evitare
la perdita di input non ancora inviati in caso di navigazione accidentale.
Non è e non deve diventare l'archivio principale delle risposte.

**Offline-first avanzato** (Service Worker, sync queue, conflict resolution)
è Fase 3/Fase 4 e non va anticipato né accennato nello Sprint 5.

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

### Azioni contestuali per stato

**Bozza:**
- `Continua` (primaria) — riapre la compilazione
- `Elimina`

**Chiuso:**
- `Duplica` — crea nuovo sopralluogo ereditando tutto
- `Sostitutivo` — avvia flusso correzione
- `Scarica PDF` (primaria)
- `Leggi` — vista dettaglio sola lettura

**Sostituito:**
- `Leggi` — sola lettura, visivamente degradato
- `Scarica PDF`
- NON mostrare Duplica né Sostitutivo

### Accesso futuro per le aziende clienti (Fase 3)

Le aziende clienti potranno accedere al proprio portale per:
- Visualizzare i propri verbali in sola lettura
- Scaricare i PDF
- Vedere lo stato delle NC aperte

Scope: Fase 3 — non anticipare.

---

## 6. Generazione PDF verbale

### Principi fondamentali

- Generazione **server-side** con PDFKit (Node.js) — mai client-side in MVP-B
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

2. **SEZ-01 → SEZ-07** — sezioni operative con risposte e azioni correttive

3. **Rilievi conclusivi** — composizione automatica:
   - Tabella riepilogativa NC per sezione
   - `note_finali_visita` del tecnico

4. **Firme** — tecnico, eventualmente RSPP (Fase 3)

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

**Scope: MVP-B** — non anticipare in MVP-A.

In MVP-A il campo azienda è testo libero nell'intestazione della visita.

Funzionalità previste in MVP-B:
- Creazione e gestione anagrafica aziende
- Associazione verbali all'azienda
- Vista scheda azienda con archivio verbali e KPI
- Ricerca e filtro aziende

---

## 8. Autenticazione e sicurezza

### MVP-B

- **Provider:** Supabase Auth
- **Token:** JWT
- **RLS:** Row Level Security su tutte le tabelle Supabase
- PDF: download solo tramite route autenticata, mai URL pubblici

### Futuro (Fase 3)

- Multi-tenancy: isolamento dati tra studi di consulenza diversi
- Client portal: accesso limitato aziende ai propri verbali
- Audit trail immutabile

---

## 9. Stack tecnico

### MVP-A (attivo)

| Componente | Tecnologia |
|---|---|
| UI | Vanilla JS + CSS nativo |
| Persistenza | localStorage |
| PDF | jsPDF (CDN, client-side) |
| Deploy | GitHub Pages |
| Repo | github.com/VINS1388/safecheck |

### MVP-B (target)

| Componente | Tecnologia |
|---|---|
| Framework | Next.js 14 App Router |
| Database | Supabase + Prisma ORM |
| PDF | PDFKit (Node.js, server-side) |
| Storage | Supabase Storage (bucket privato) |
| Auth | Supabase Auth + JWT |
| Email | Resend |
| Deploy | Vercel |
| Dev env | Claude Code CLI (PowerShell) |

### Path locale sviluppo

```
F:\StudioBilello\2026\safecheck
```

---

## 10. Decisioni aperte

Questa sezione traccia le decisioni ancora da prendere.

| # | Argomento | Contesto |
|---|---|---|
| D-01 | Finalizzare SEZ-04 → SEZ-07 | Contenuto domande da rivedere con Vincenzo |
| D-02 | Firma digitale | Standard, provider, validità legale — Fase 3 |
| D-03 | Trademark "SafeCheck" | Verifica disponibilità nome e dominio |
| D-04 | Piani di pricing | Struttura abbonamento per multi-tenancy |
| D-05 | Lingua UI | Solo italiano o anche inglese? |

---

*Documento creato: giugno 2025 — Ultimo aggiornamento: 30 giugno 2026 (DOC-ALIGN-01)*
*Da aggiornare ad ogni sessione di design SafeCheck su Claude.ai*
