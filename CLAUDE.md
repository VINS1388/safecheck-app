# CLAUDE.md — SafeCheck

Questo file contiene le istruzioni permanenti per Claude Code sul progetto SafeCheck.
Leggilo integralmente prima di toccare qualsiasi file del repo.

---

## Identità del progetto

**SafeCheck** è una web app mobile-first per ispezioni di sicurezza sul lavoro (*sopralluoghi*),
destinata a consulenti RSPP italiani che operano sotto D.Lgs. 81/2008.

Obiettivo core: eliminare il rework post-sopralluogo. Il tecnico compila i dati in campo
una sola volta e il sistema genera automaticamente il verbale PDF professionale.

**Verticale attuale:** sopralluoghi sicurezza sul lavoro (D.Lgs. 81/2008) — unico verticale implementato.
**Template futuri:** l'architettura è predisposta per accogliere template aggiuntivi (es. HACCP)
tramite il sistema `template_master` / `template_cliente` già presente nello schema DB.
**Regola ferrea:** non implementare HACCP né altri template finché non esplicitamente richiesto.
La checklist canonica delle 55 domande sicurezza non va modificata senza istruzione esplicita.

**Owner:** Vincenzo (Studio Bilello) — IP personale esclusivo.
**Repo:** https://github.com/VINS1388/safecheck
**Deploy prototipo:** https://vins1388.github.io/safecheck/app/

---

## Stack tecnico

### MVP-A (prototipo attivo)
- Single-file PWA: `app/index.html`
- Vanilla JS, CSS nativo, localStorage
- jsPDF da CDN per generazione PDF client-side
- Deploy: GitHub Pages (branch `main`)

### MVP-B (target architecture)
- **Framework:** Next.js 14 App Router
- **Database:** Supabase + Prisma ORM
- **Deploy:** Vercel
- **Email:** Resend
- **PDF generation:** PDFKit (server-side, Node.js)
- **Storage PDF:** Supabase private bucket (mai URL pubblici)
- **Auth:** Supabase Auth + JWT

---

## Struttura cartelle

```
safecheck/
├── app/                        # MVP-A — prototipo single-file
│   └── index.html
├── docs/                       # Documentazione di prodotto
│   ├── SPECIFICHE_FUNZIONALI.md
│   └── (altri doc di spec)
├── scripts/                    # Script standalone (PDF spike, test, ecc.)
├── CLAUDE.md                   # Questo file
└── README.md
```

---

## Vocabolario di dominio

| Termine | Significato |
|---|---|
| *verbale* | Report di ispezione generato dopo il sopralluogo |
| *sopralluogo* | Visita ispettiva in azienda |
| NC / non conformità | Risposta negativa a una domanda del checklist |
| PC / parziale conformità | Risposta parzialmente negativa |
| C / conforme | Risposta positiva |
| NV / non valutabile | Non applicabile per motivi tecnici |
| NA / non applicabile | Fuori scope per quella azienda |
| RSPP | Responsabile Servizio Prevenzione e Protezione |
| RLS | Rappresentante Lavoratori per la Sicurezza |
| MC | Medico Competente |
| DVR | Documento di Valutazione dei Rischi |
| *nominativi* | Figure della sicurezza nominate nell'azienda |
| *bozza* | Verbale in compilazione, modificabile |
| *chiuso* | Verbale con PDF generato, immutabile |
| *sostituito* | Verbale annullato da un sostitutivo |

---

## Checklist — struttura canonica

Il template è composto da **55 domande (SEZ-01: 13, SEZ-02: 7, SEZ-03: 10, SEZ-04: 7, SEZ-05: 7, SEZ-06: 6, SEZ-07: 5)** suddivise in **7 sezioni operative**:

| Sezione | Contenuto |
|---|---|
| SEZ-01 | Nominativi figure della sicurezza |
| SEZ-02 | Documentazione obbligatoria |
| SEZ-03 | Formazione (10 domande per figura) |
| SEZ-04 | Sorveglianza sanitaria |
| SEZ-05 | Dispositivi di protezione individuale (DPI) |
| SEZ-06 | Emergenze e primo soccorso |
| SEZ-07 | Ambienti di lavoro e attrezzature |

**Tipi di risposta validi:** `C` · `PC` · `NC` · `NV` · `NA`

Il campo `azione_correttiva` appare **solo** per risposte NC o PC.
Il campo `tipo_risposta: TESTO_LIBERO` NON esiste per le 55 domande (SEZ-01: 13, SEZ-02: 7, SEZ-03: 10, SEZ-04: 7, SEZ-05: 7, SEZ-06: 6, SEZ-07: 5) principali —
è usato solo per `campi_extra` e `note_finali_visita`.

**Registro infortuni:** rimosso da SEZ-02 (abolito da D.Lgs. 151/2015).

---

## Ciclo di vita del verbale

```
bozza ──→ chiuso ──→ sostituito
```

### Regole di stato — NON DEROGABILI

| Stato | Azioni disponibili | Note |
|---|---|---|
| `bozza` | Continua · Elimina | Nessuna altra azione |
| `chiuso` | Leggi · Scarica PDF · Duplica · Crea sostitutivo | PDF immutabile |
| `sostituito` | Leggi (sola lettura) · Scarica PDF | Mai modificabile |

**Duplica:** disponibile SOLO da stato `chiuso`. Mai da `bozza`.
**Crea sostitutivo:** disponibile SOLO da stato `chiuso`.
**Modifica diretta:** VIETATA su verbale chiuso. Si usa sempre il flusso sostitutivo.

### Comportamento Duplica
- Deep clone completo: anagrafica + risposte + azioni correttive
- Campi resettati nella copia: `id` (nuovo UUID), `data_visita` (oggi), `stato` ("bozza")
- Campo genealogia: `derivato_da: <id_sorgente>`
- Il verbale originale NON cambia stato

### Comportamento Crea sostitutivo
- Deep clone completo del verbale chiuso
- Il verbale originale passa a stato `"sostituito"` e acquisisce `sostituito_da: <nuovo_id>`
- Il nuovo verbale acquisisce `sostituisce: <id_originale>` e parte come `bozza`

### Struttura dati genealogia verbale
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
  "anagrafica": {},
  "template_snapshot": {},
  "risposte": {},
  "note_finali_visita": "",
  "meta": {
    "data_creazione": "ISO8601",
    "data_chiusura": "ISO8601 | null",
    "pdf_path": "bucket/private/SC-YYYY-NNN.pdf | null",
    "pdf_sha256": "interno, mai stampato nel PDF"
  }
}
```

---

## PDF verbale — regole fondamentali

- Generazione **server-side** con PDFKit (mai client-side in MVP-B)
- PDF **immutabile** una volta generato: nessuna modifica, solo sostitutivo
- Storage in **bucket privato** Supabase — mai URL pubblici
- Download sempre tramite route autenticata
- `rif_normativo` e `note_tecnico` sono campi **interni**, mai stampati nel PDF
- `sha256` è **metadato interno** del DB, mai stampato nel PDF
- `correzione_default` è solo suggerimento interno; nel PDF appare solo `correzione_suggerita_finale` confermata dal tecnico
- I *rilievi conclusivi* sono composizione automatica (riepilogo NC + `note_finali_visita`), non una sezione strutturata

---

## Regole di business — API (MVP-B)

- `POST /verbali/:id/duplica` → restituisce `403` se `stato !== "chiuso"`
- `POST /verbali/:id/sostitutivo` → restituisce `403` se `stato !== "chiuso"`
- `PATCH /verbali/:id` → restituisce `403` se `stato !== "bozza"`
- Mai fidarsi del frontend per le regole di stato: la validazione è sempre server-side

### Autenticazione nelle route API — regola esplicita

Il middleware globale esclude `/api/*` dalla protezione automatica dei redirect.
Questo NON significa che le route API sono pubbliche.

**Ogni route API deve validare esplicitamente l'utente server-side** prima di eseguire
qualsiasi operazione su dati, PDF, visite, verbali, duplicazioni, sostitutivi, download o delete.

Pattern obbligatorio per ogni route API:
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

Il frontend non è mai fonte di verità per permessi, stati o identità utente.

---

## Anagrafica clienti (aziende)

- **In scope da MVP-B** — non anticipare in MVP-A
- In MVP-A il campo azienda è testo libero nell'anagrafica della visita
- Ogni azienda ha il proprio archivio verbali (lista con stati, azioni contestuali, KPI sintetici)

---

## Numerazione verbali

Formato: `SC-YYYY-NNN` (es. `SC-2025-0042`)
- In MVP-A: progressivo locale in localStorage
- In MVP-B: sequenza atomica server-side per azienda

---

## Stato sprint

| Sprint | Contenuto | Stato |
|---|---|---|
| Sprint 0 | Scaffolding Next.js, Vercel, Supabase link | ✅ Completato |
| Sprint 1 | Schema DB, 12 tabelle, 4 enum, RLS | ✅ Completato |
| Sprint 2 | Seed 52 domande, RLS 28 policy, tipi TypeScript | ✅ Completato |
| Sprint 3 | Auth Supabase, login/logout, layout dashboard, trigger new user | ✅ Completato |
| Sprint 4 | CRUD clienti e sedi, componenti UI base (Button, Input, Card, Badge) | ✅ Completato |
| Sprint 5 | Compilazione checklist in campo | 🔄 In avvio |

**Repo attivo:** https://github.com/VINS1388/safecheck-app
**Deploy:** https://safecheck-app-tau.vercel.app
**Path locale:** F:\StudioBilello\2026\safecheck-app

---

## Separazione dei concern — regola fondamentale

| Ambiente | Scopo |
|---|---|
| Claude.ai (questa chat) | Design, decisioni di prodotto, specifiche, documentazione |
| Claude Code CLI | Implementazione, modifica file, esecuzione codice |

**Claude Code non prende decisioni di prodotto.** Esegue istruzioni precise
prodotte nelle sessioni Claude.ai e documentate in `docs/SPECIFICHE_FUNZIONALI.md`.

---

## Dati di test

- Tutti i dati usati in MVP-A e MVP-B devono essere **fittizi**
- Dati reali di clienti richiedono autorizzazione scritta esplicita — non procedere mai senza
- Azienda di test: "Alice Pizza Srl" o equivalente di fantasia

---

## Persistenza bozza — decisione Sprint 5

**Fonte di verità per le bozze: Supabase.** Ogni risposta compilata viene salvata
in Supabase in tempo reale tramite autosave su ogni modifica.

`localStorage` è ammesso **solo** come cache temporanea di recupero UI (es. evitare
perdita di input non ancora inviati in caso di navigazione accidentale).
Non è e non deve diventare l'archivio principale delle risposte.

**Offline-first avanzato** (Service Worker, sync queue, conflict resolution)
rimane in Fase 3/Fase 4. Non va anticipato né accennato nello Sprint 5.

---

## Cosa NON fare — lista esplicita

- NON eseguire azioni autonome non richieste esplicitamente
- NON anticipare funzionalità di fasi future nella fase corrente
- NON modificare la struttura del template JSON canonico senza istruzione esplicita
- NON usare URL pubblici per i PDF
- NON stampare nel PDF: `sha256`, `rif_normativo`, `note_tecnico`, `correzione_default`
- NON permettere Duplica o Crea sostitutivo su verbali in stato `bozza`
- NON usare `TESTO_LIBERO` come `tipo_risposta` per le 55 domande (SEZ-01: 13, SEZ-02: 7, SEZ-03: 10, SEZ-04: 7, SEZ-05: 7, SEZ-06: 6, SEZ-07: 5) principali
- NON aggiungere il registro infortuni (abolito D.Lgs. 151/2015)
- NON fare commit autonomi senza conferma esplicita di Vincenzo
- NON implementare integrazione Safety Risk Suite (SRS2) — i contratti SiteContext/AuditResult sono definiti ma non implementati
- NON implementare il modulo sopralluogo planimetrico — è Fase 3
- NON implementare template HACCP o altri verticali — solo sicurezza D.Lgs. 81/2008 ora
- NON usare localStorage come archivio principale delle risposte — solo Supabase

---

*Ultimo aggiornamento: 30 giugno 2026 — sessione Claude.ai SafeCheck (DOC-ALIGN-01)*
