# CLAUDE.md — SafeCheck

Questo file contiene le istruzioni permanenti per Claude Code sul progetto SafeCheck.
Leggilo integralmente prima di toccare qualsiasi file del repo.

---

## Identità del progetto

**SafeCheck** è una web app mobile-first per ispezioni di sicurezza sul lavoro (*sopralluoghi*),
destinata a consulenti RSPP italiani che operano sotto D.Lgs. 81/2008.

Obiettivo core: eliminare il rework post-sopralluogo. Il tecnico compila i dati in campo
una sola volta e il sistema genera automaticamente il verbale PDF professionale.

**Stato attuale: PRODUZIONE.** Go-live cliente reale completato il 30 giugno 2026.

**Verticale attuale:** sopralluoghi sicurezza sul lavoro (D.Lgs. 81/2008) — unico verticale implementato.
**Template futuri:** l'architettura è predisposta per accogliere template aggiuntivi (es. HACCP)
tramite il sistema `template_master` / `template_cliente` già presente nello schema DB.
**Regola ferrea:** non implementare HACCP né altri template finché non esplicitamente richiesto.
La checklist canonica non va modificata senza istruzione esplicita.

**Owner:** Vincenzo (Studio Bilello) — IP personale esclusivo.
**Repo attivo:** https://github.com/VINS1388/safecheck-app
**Deploy:** https://safecheck-app-tau.vercel.app
**Path locale:** F:\StudioBilello\2026\safecheck-app
**Repo MVP-A (archiviato, solo riferimento storico):** https://github.com/VINS1388/safecheck

---

## Stack tecnico (produzione)

- **Framework:** Next.js 14 App Router
- **Database:** Supabase + Prisma ORM
- **Deploy:** Vercel (deploy automatico su push a `main`)
- **Email:** Resend
- **PDF generation:** PDFKit (server-side, Node.js)
- **Storage PDF:** Supabase private bucket (mai URL pubblici)
- **Auth:** Supabase Auth + JWT

MVP-A (prototipo single-file PWA su GitHub Pages) è archiviato e non più sviluppato.
Usare solo come riferimento storico, mai come base di lavoro.

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
| DUVRI | Documento Unico Valutazione Rischi Interferenziali (Art. 26 D.Lgs. 81/08) |
| *nominativi* | Figure della sicurezza nominate nell'azienda |
| *bozza* | Verbale in compilazione, modificabile |
| *chiuso* | Verbale con PDF generato, immutabile |
| *sostituito* | Verbale annullato da un sostitutivo |
| *macroarea* | Raggruppamento tematico di domande all'interno di una sezione |
| *template snapshot* | Copia immutabile del template al momento di creazione visita |

---

## Checklist — struttura canonica

Il template è composto da **64 domande totali**, suddivise in **8 sezioni operative**:

| Sezione | Contenuto | N. domande |
|---|---|---|
| SEZ-01 | Nominativi figure della sicurezza | 13 |
| SEZ-02 | Documentazione obbligatoria | 7 |
| SEZ-03 | Formazione (10 domande per figura) | 10 |
| SEZ-04 | Sorveglianza sanitaria | 7 |
| SEZ-05 | Dispositivi di protezione individuale (DPI) | 7 |
| SEZ-06 | Emergenze e primo soccorso | 6 |
| SEZ-07 | Ambienti di lavoro e attrezzature | 5 |
| SEZ-08 | Appalti e contratti d'opera (Art. 26 / DUVRI) | 9 |

`template_master` versione corrente: **3** (introdotta con migration 011, Sprint 9).

**Tipi di risposta validi:** `C` · `PC` · `NC` · `NV` · `NA`

Il campo `azione_correttiva` appare **solo** per risposte NC o PC.
Il campo `tipo_risposta: TESTO_LIBERO` NON esiste per le domande standard SEZ-01→SEZ-07 —
è usato solo per `campi_extra`, `note_finali_visita`, e per il campo testo libero dedicato
di SEZ-08 (vedi sotto).

**Registro infortuni:** rimosso da SEZ-02 (abolito da D.Lgs. 151/2015).

### SEZ-08 — Appalti e contratti d'opera (Art. 26 / DUVRI) — introdotta Sprint 9

Prima sezione con **logica condizionale a livello di sezione**: la domanda filtro
D-08-001 ("Presenza di appalti, contratti d'opera o di somministrazione") determina
se le restanti 8 domande della sezione sono richieste o collassate.

**Comportamento del collasso:**
- Valore di collasso: `NA` su D-08-001 → le domande D-08-002...D-08-009 vengono
  nascoste in UI, escluse dal calcolo di completezza, e omesse dal PDF (si stampa
  solo il titolo sezione + la domanda filtro).
- Qualunque altro esito su D-08-001 (`C` / `PC` / `NC` / `NV`) → sezione espansa,
  le 8 domande diventano obbligatorie ai fini della chiusura del verbale.
- Logica centralizzata in `completa.ts` tramite `VALORE_FILTRO_COLLASSO` e gli
  helper `sezioneCollassata()` / `domandaAttiva()`, riusati da UI, riepilogo,
  route API e generazione PDF. **Non duplicare questa logica altrove**: qualunque
  sezione condizionale futura deve riusare questo stesso motore.

**Conteggio NA nei rilievi conclusivi:** quando la sezione è collassata, il
conteggio NA per SEZ-08 è **1** (solo la domanda filtro), non 9. Le domande
non attivate non sono "valutate NA", semplicemente non sono mai state poste:
contarle tutte come NA falsificherebbe il riepilogo. Questa regola vale per
ogni sezione condizionale futura.

**Campo testo libero D-08-003** (elenco imprese): persistito su
`risposte.osservazione_evidenza` (nessuna colonna dedicata). Quando il campo
extra testo libero è presente, sostituisce il textarea standard di osservazione
PC/NC per evitare doppio input sulla stessa colonna. Nel PDF è sempre stampato,
indipendentemente dall'esito della domanda.

> ⚠️ Questo campo è **in fase di estensione** — vedi Sprint 9.1 più sotto.
> L'elenco imprese come testo libero unico è un'implementazione transitoria,
> da sostituire con il modello multi-impresa strutturato.

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

> Nota: Duplica e Crea sostitutivo sono **progettati ma non ancora implementati
> in UI/API** — pianificati per Sprint 11. Le regole di stato sopra sono comunque
> vincolanti fin da ora per qualunque sviluppo che le tocchi.

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

- Generazione **server-side** con PDFKit (mai client-side)
- PDF **immutabile** una volta generato: nessuna modifica, solo sostitutivo
- Storage in **bucket privato** Supabase — mai URL pubblici
- Download sempre tramite route autenticata
- `rif_normativo` e `note_tecnico` sono campi **interni**, mai stampati nel PDF
- `sha256` è **metadato interno** del DB, mai stampato nel PDF
- `correzione_default` è solo suggerimento interno; nel PDF appare solo
  `correzione_suggerita_finale` confermata dal tecnico
- I *rilievi conclusivi* sono composizione automatica (riepilogo NC + `note_finali_visita`),
  non una sezione strutturata
- Sezioni condizionali collassate: si stampa solo titolo sezione + domanda filtro
  (vedi regola SEZ-08 sopra)

---

## Regole di business — API

- `POST /verbali/:id/duplica` → restituisce `403` se `stato !== "chiuso"` (pianificato Sprint 11)
- `POST /verbali/:id/sostitutivo` → restituisce `403` se `stato !== "chiuso"` (pianificato Sprint 11)
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

- Implementata: CRUD clienti e sedi (Sprint 4), CRUD completo + dashboard reale pianificato Sprint 10
- Ogni azienda ha il proprio archivio verbali (lista con stati, azioni contestuali, KPI sintetici)

---

## Numerazione verbali

Formato: `SC-YYYY-NNN` (es. `SC-2026-0001`)
Sequenza atomica server-side per azienda (RPC, introdotta Sprint 6).

---

## Stato sprint

| Sprint | Contenuto | Stato |
|---|---|---|
| Sprint 0 | Scaffolding Next.js, Vercel, Supabase link | ✅ Completato |
| Sprint 1 | Schema DB, 12 tabelle, 4 enum, RLS | ✅ Completato |
| Sprint 2 | Seed 52 domande, RLS 28 policy, tipi TypeScript | ✅ Completato |
| Sprint 3 | Auth Supabase, login/logout, layout dashboard, trigger new user | ✅ Completato |
| Sprint 4 | CRUD clienti e sedi, componenti UI base (Button, Input, Card, Badge) | ✅ Completato |
| Sprint 5 | Compilazione checklist in campo | ✅ Completato |
| Sprint 6 | PDF server-side PDFKit, bucket privato, numerazione RPC atomica | ✅ Completato |
| Sprint 7 | Schermata avvio, nominativi SEZ-01, motivazione NV/NA, mobile-first | ✅ Completato |
| Sprint 7-FIX | Default azione/motivazione obbligatori, riscrittura domande SEZ-01/06 (55 tot), campo descrizione | ✅ Completato |
| Sprint 8 | Campi testo espandibili, campo osservazione evidenza, fix layout PDF (rilievi + pagine vuote) | ✅ Completato |
| PRE-GOLIVE | Rename cliente test → "Pane Pizza Srl", utente reale parametrico, verifica end-to-end | ✅ Completato |
| **GO-LIVE** | **Produzione attiva, cliente reale** | ✅ **30/06/2026** |
| Sprint 9 | SEZ-08 Art. 26 Appalti/DUVRI, motore logica condizionale a livello sezione (migration 011) | ✅ Completato — commit in corso |
| **Sprint 9.1** | **Multi-impresa in SEZ-08: elenco strutturato imprese appaltatrici/subappaltatrici/lav. autonomi, 8 domande di controllo ripetute per impresa** | 🔄 **In progettazione — vedi sezione dedicata sotto** |
| Sprint 10 | CRUD completo clienti/sedi, UI refinement, dashboard reale | ⏳ Pianificato |
| Sprint 11 | Duplica e Crea sostitutivo (genealogia verbali) | ⏳ Pianificato |
| Sprint 12 | Motore checklist evoluto: nominativi dinamici per domanda, scadenze automatiche da data verifica | ⏳ Pianificato (dopo periodo pilota) |
| Sprint 13 | NC tracking: scadenze azioni correttive, solleciti | ⏳ Pianificato |
| Sprint 14 | Pianificazione visite (contratto N visite/anno per sede, alert scadenze; poi menu centralizzato pianificazione tecnici) | ⏳ Pianificato |
| Sprint 15 | Sopralluogo planimetrico (stile PlanRadar, pin su planimetria) | ⏳ Pianificato |
| Sprint 16 | Template HACCP (scoring 0/0.5/1/A, checklist combinata Alice Pizza/Pane Pizza) | ⏳ Pianificato |
| Sprint 17 | Client portal e firma digitale | ⏳ Pianificato |
| Sprint 18+ | Integrazione Safety Risk Suite 2.0 (progetto separato, contratti SiteContext/AuditResult, Supabase project separato, comunicazione solo via API) | ⏳ Pianificato |

---

## Sprint 9.1 — Multi-impresa SEZ-08 (decisione architetturale, in attesa di esecuzione)

**Problema:** l'implementazione Sprint 9 di SEZ-08 tratta le 8 domande di controllo
(tesserini, DUVRI, idoneità tecnico-professionale, ecc.) come uniche per l'intera
sezione, con l'elenco imprese relegato a testo libero su D-08-003. Nella realtà
operativa possono essere presenti **N imprese appaltatrici/subappaltatrici/lavoratori
autonomi** (tipicamente 1 a 6+, variabile), ciascuna con un proprio esito potenzialmente
diverso sulle stesse 8 domande (es. tesserini OK per l'impresa A, NC per l'impresa B).

**Decisione confermata da Vincenzo (sessione Claude.ai, 30/06/2026):**

1. Le 8 domande di controllo (D-08-002...D-08-009) si ripetono **integralmente per
   ogni impresa** inserita — non esiste una via di mezzo con alcune domande uniche
   a livello sezione.
2. La domanda filtro D-08-001 resta **unica a livello di sezione** (non per impresa).
3. Per ogni impresa si raccolgono: **ragione sociale** + **tipo** (select:
   appaltatrice / subappaltatrice / lavoratore autonomo — distinzione rilevante
   anche ai fini degli obblighi Art. 26).
4. Il numero di imprese è **variabile e potenzialmente alto (6+)** → la UI deve
   essere lista compatta (nome impresa + stato sintetico, es. "Alfa Impianti —
   2 NC") che apre una scheda dedicata per impresa, non uno scroll lineare con
   tutte le domande di tutte le imprese in sequenza. Pattern mobile-first coerente
   col resto dell'app.
5. Nel PDF: **sotto-sezione dedicata per ogni impresa**, con le 8 domande estese
   per ciascuna (non una tabella riassuntiva).

**Architettura dati decisa:**
- Nuova tabella `imprese_appalto` (id, visita_id, ragione_sociale, tipo_impresa, ordine)
- Nuova tabella `risposte_imprese_appalto` (id, impresa_id, domanda_id, esito,
  osservazione, azione_correttiva) — **non** riusare `risposte` con una colonna
  `impresa_id` nullable: terrebbe `risposte` semanticamente sporca (1 riga = 1
  risposta standard di sezione) per un caso che riguarda solo SEZ-08.
- Il motore di collasso/espansione di sezione (Sprint 9) **resta invariato e viene
  riusato** per la domanda filtro D-08-001. Cambia solo cosa succede quando la
  sezione è espansa: invece di 8 domande singole, si genera un contenitore
  "lista imprese" che produce N copie delle 8 domande.

**Impatto su completezza verbale:** `completa.ts` deve essere esteso così che,
a sezione espansa, la sezione SEZ-08 sia completa quando: almeno 1 impresa è
stata inserita E per ogni impresa inserita tutte le 8 domande hanno risposta.

**Impatto su riepilogo/rilievi conclusivi:** il conteggio NC/PC/NA deve aggregare
su tutte le imprese (N×8 risposte), mantenendo nel PDF il dettaglio per impresa
come da punto 5 sopra.

**Pattern riusabile:** questo è il primo caso in SafeCheck di "blocco di domande
ripetibile legato a un'entità anagrafica creata dal tecnico in campo" (diverso dai
nominativi multi-tag di SEZ-01, che sono semplici liste di stringhe senza domande
associate). Va costruito con un minimo di generalità di naming, senza
sovra-ingegnerizzare per casi d'uso futuri non ancora richiesti.

**Stato:** in attesa di prompt esecutivo dettagliato per Claude Code. Non ancora
implementato. Il commit Sprint 9 (motore di collasso) procede comunque, separato
e indipendente da questa estensione.

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

- Tutti i dati di test devono essere **fittizi**
- Dati reali di clienti richiedono autorizzazione scritta esplicita — non procedere mai senza
- Azienda di test: "Pane Pizza Srl" o equivalente di fantasia
- Cliente reale di produzione: **Pane Pizza Srl**
- Promemoria attivo: prima della consegna definitiva al cliente reale, azzerare di
  nuovo il DB (clienti/sedi/visite/verbali_pdf/storage) per rimuovere i verbali di
  test generati post-creazione utente reale (es. SC-2026-0001 con dati fittizi nei
  nominativi). **Operazione rimandata volontariamente — non eseguire finché non
  esplicitamente richiesta da Vincenzo.**

---

## Persistenza bozza — decisione Sprint 5

**Fonte di verità per le bozze: Supabase.** Ogni risposta compilata viene salvata
in Supabase in tempo reale tramite autosave su ogni modifica.

`localStorage` è ammesso **solo** come cache temporanea di recupero UI (es. evitare
perdita di input non ancora inviati in caso di navigazione accidentale).
Non è e non deve diventare l'archivio principale delle risposte.

**Offline-first avanzato** (Service Worker, sync queue, conflict resolution)
rimane in Fase 3/Fase 4. Non va anticipato.

---

## Sicurezza — azione richiesta

⚠️ **Due Personal Access Token Supabase risultano esposti in chat in chiaro durante
sessioni precedenti** (prefissi `sbp_64fc8f…` e `sbp_78fcf1…`). **Entrambi devono
essere ruotati** se non è già stato fatto. Non passare mai PAT o altre credenziali
in chiaro in chat, né qui né con Claude Code: usare sempre variabili d'ambiente o
gestori di credenziali.

---

## TODO tecnico non urgente

- Migrare le restanti 47 domande di `template_master` dal campo `note_tecnico` al
  campo `descrizione` (solo 8 domande SEZ-01/SEZ-06 migrate finora, migration 009).
  `DomandaCard.tsx` ha un fallback `descrizione → note_tecnico` che funziona ma
  lascia il modello dati incoerente. Da fare in uno sprint di manutenzione
  post-pilota, non bloccante.

---

## Cosa NON fare — lista esplicita

- NON eseguire azioni autonome non richieste esplicitamente
- NON anticipare funzionalità di fasi future nella fase corrente
- NON modificare la struttura del template JSON canonico senza istruzione esplicita
- NON usare URL pubblici per i PDF
- NON stampare nel PDF: `sha256`, `rif_normativo`, `note_tecnico`, `correzione_default`
- NON permettere Duplica o Crea sostitutivo su verbali in stato `bozza`
- NON usare `TESTO_LIBERO` come `tipo_risposta` per le domande standard SEZ-01→SEZ-07
- NON aggiungere il registro infortuni (abolito D.Lgs. 151/2015)
- NON fare commit o push autonomi senza conferma esplicita di Vincenzo
- NON implementare integrazione Safety Risk Suite (SRS2) — i contratti
  SiteContext/AuditResult sono definiti ma non implementati
- NON implementare il modulo sopralluogo planimetrico — è Sprint 15
- NON implementare template HACCP o altri verticali — è Sprint 16
- NON usare localStorage come archivio principale delle risposte — solo Supabase
- NON azzerare il DB di produzione senza richiesta esplicita di Vincenzo
- NON inserire dati reali del cliente nei test — usare sempre dati fittizi o test
  in-memory che non scrivono su DB di produzione
- NON duplicare la logica di collasso/espansione sezione condizionale: riusare
  sempre `VALORE_FILTRO_COLLASSO` / `sezioneCollassata()` / `domandaAttiva()` da
  `completa.ts`
- NON riusare la tabella `risposte` per le risposte multi-impresa di SEZ-08
  (Sprint 9.1) — tabella dedicata `risposte_imprese_appalto`

---

*Ultimo aggiornamento: 30 giugno 2026 — sessione Claude.ai SafeCheck (DOC-ALIGN-02, post Sprint 9 / pre Sprint 9.1)*
