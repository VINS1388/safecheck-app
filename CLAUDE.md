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

`template_master` versione corrente: **4** (migration 012, Sprint 9.1 — marker `multi_impresa: true` su SEZ-08).
Versione precedente 3 introdotta con migration 011, Sprint 9.

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

**Multi-impresa (Sprint 9.1, completato):** SEZ-08 supporta ora N imprese
appaltatrici/subappaltatrici/lavoratori autonomi per visita, ciascuna con le
proprie 8 risposte indipendenti su D-08-002...D-08-009. Tabelle dedicate
`imprese_appalto` e `risposte_imprese_appalto` (migration 012). Discriminatore
v1/v1.1: marker `multi_impresa: true` nel template snapshot — le visite create
prima di questo sprint (template v3) restano sul modello v1 a domande singole,
immutabili per snapshot; le visite create da template v4 in poi usano il
modello multi-impresa. Non convertire mai retroattivamente uno snapshot v3.

Il vecchio campo testo libero D-08-003 ("elenco imprese" su
`risposte.osservazione_evidenza`) è stato **rimosso** dal modello multi-impresa:
l'impresa è ora un'entità anagrafica propria (ragione sociale + tipo), non più
un testo libero. Resta solo nei 3 verbali bozza legacy v1 esistenti al momento
della migrazione, che mantengono il comportamento originale.

**Obbligatorietà azione correttiva (per-impresa):** per le risposte
per-impresa, `azione_correttiva` è obbligatoria su esito NC/PC esattamente
come per le domande standard — nessuna eccezione di rigore per il modello
multi-impresa. Una domanda con NC/PC senza azione correttiva valorizzata
conta come mancante ai fini della completezza sezione.

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

## Anagrafica clienti (aziende) e sedi — aggiornato Sprint 10

**Modello dati confermato (verificato su schema live, Sprint 10):**

- **Sede legale**: 1:1 con il cliente, campi sul record `clienti` stesso
  (non tabella separata — relazione 1:1, normalizzarla sarebbe inutile).
  Campi già presenti da prima di Sprint 10: `ragione_sociale`,
  `partita_iva`, `codice_fiscale`, `indirizzo_sede_legale`, `citta`, `cap`,
  `provincia`, `referente_principale`, `telefono_referente`,
  `email_referente`. Editabile in UI da Sprint 10 (form "Modifica cliente").
- **Sedi operative**: 1:N con il cliente, tabella `sedi` dedicata. Campi:
  `nome`, `indirizzo`, `citta`, `cap`, `provincia`, `referente_sede`,
  `telefono_referente`, `note`, `attiva` (soft-delete), `principale`
  (bool, aggiunto migration 013 — preselezione di default su nuova visita,
  unicità garantita a livello applicativo, non indice parziale, per evitare
  violazioni transitorie tra due UPDATE in sequenza).
- `visite.sede_id` è FK verso `sedi(id)`, `NOT NULL` — non testo libero.
  Nessuna sede o cliente può essere eliminato fisicamente se esistono
  visite collegate: solo soft-delete (`attiva = false`), per preservare
  l'integrità storica dei verbali.

**CRUD completo (Sprint 10):** creazione/modifica/soft-delete sedi
operative, marcatura sede principale, dashboard reale con KPI di studio.

**KPI di studio (dashboard, Sprint 10):** esposti via due RPC
`SECURITY INVOKER` (non `DEFINER` — la regola `SET search_path=''` del
progetto si applica storicamente alle funzioni `SECURITY DEFINER`, dove un
search_path manipolabile è un vettore di privilege escalation; su
`SECURITY INVOKER` il rischio è strutturalmente diverso). Corpo di
entrambe le funzioni interamente schema-qualificato (`public.*`) su ogni
riferimento a tabella utente, verificato riga per riga prima del commit.
`dashboard_kpi()`: clienti attivi, verbali totali, NC rilevate aggregate
(somma di NC standard + NC per-impresa SEZ-08 nei verbali `chiuso` — **non**
un conteggio di "NC da risolvere", quello arriva con NC tracking Sprint 13;
disclaimer esplicito in UI). `dashboard_clienti()`: rollup per cliente
(numero sedi, numero verbali, ultimo sopralluogo).

**Multi-tenancy:** non implementata, non in scope. Single-tenant, Studio
Bilello unico utente. Nessuna selezione studio in UI.

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
| Sprint 9 | SEZ-08 Art. 26 Appalti/DUVRI, motore logica condizionale a livello sezione (migration 011) | ✅ Completato |
| Sprint 9.1 | Multi-impresa in SEZ-08: tabelle dedicate `imprese_appalto`/`risposte_imprese_appalto`, UI lista+scheda, PDF per-impresa, discriminatore template v4 (migration 012) | ✅ Completato |
| Sprint 10 | CRUD completo sedi operative (distinte da sede legale su `clienti`), dashboard reale con KPI di studio via RPC, ricerca clienti (migration 013) | ✅ Completato |
| Sprint 11 | Duplica e Crea sostitutivo (genealogia verbali) | ⏳ Pianificato |
| Sprint 12 | Motore checklist evoluto: nominativi dinamici per domanda, scadenze automatiche da data verifica | ⏳ Pianificato (dopo periodo pilota) |
| Sprint 13 | NC tracking: scadenze azioni correttive, solleciti | ⏳ Pianificato |
| Sprint 14 | Pianificazione visite (contratto N visite/anno per sede, alert scadenze; poi menu centralizzato pianificazione tecnici) | ⏳ Pianificato |
| Sprint 15 | Sopralluogo planimetrico (stile PlanRadar, pin su planimetria) | ⏳ Pianificato |
| Sprint 16 | Template HACCP (scoring 0/0.5/1/A, checklist combinata Alice Pizza/Pane Pizza) | ⏳ Pianificato |
| Sprint 17 | Client portal e firma digitale | ⏳ Pianificato |
| Sprint 18+ | Integrazione Safety Risk Suite 2.0 (progetto separato, contratti SiteContext/AuditResult, Supabase project separato, comunicazione solo via API) | ⏳ Pianificato |

---

## Sprint 9.1 — Multi-impresa SEZ-08 — ✅ COMPLETATO

**Implementato.** Vedi `docs/SPECIFICHE_FUNZIONALI.md` sezione 10 per il
dettaglio completo delle decisioni e dell'implementazione verificata
(migration 012, scenari di test A-E, discriminatore template v4).

Riepilogo essenziale per riferimento rapido:

- Tabelle dedicate `imprese_appalto` e `risposte_imprese_appalto` (no FK a
  tabella `domande`, che non esiste — `domanda_id` è TEXT, coerente con
  `risposte`).
- Discriminatore v1/v1.1: marker `multi_impresa: true` su SEZ-08 nel
  `template_master` v4. Visite su snapshot v3 (3 bozze legacy verificate al
  momento della migrazione) restano sul modello a domande singole — mai
  convertite retroattivamente.
- Completezza: ≥1 impresa inserita e tutte le 8 domande risposte per ciascuna,
  inclusa `azione_correttiva` obbligatoria su NC/PC (allineata alla regola
  standard, nessuna eccezione per il modello multi-impresa).
- UI: lista compatta + scheda dedicata per impresa (`SezioneAppaltiImprese.tsx`),
  `DomandaCard.tsx` non duplicato — riusato con contesto sollevato in
  `ChecklistClient.tsx`.
- PDF: sotto-sezione estesa per ogni impresa, non tabella riassuntiva.
- Motore di collasso/espansione (Sprint 9) invariato, riusato identico per
  la domanda filtro D-08-001.

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

## Sicurezza — azione richiesta (NON ANCORA RISOLTA — priorità alta)

⚠️ **Due Personal Access Token Supabase risultano esposti in chat in chiaro durante
sessioni precedenti** (prefissi `sbp_64fc8f…` e `sbp_78fcf1…`). **Confermato non
ancora ruotati al 30/06/2026, post Sprint 10** — Vincenzo ha scelto di procedere
con lo sviluppo in parallelo, ma questa azione resta da chiudere quanto prima:
ogni sprint che passa con il PAT attivo è una finestra di rischio aperta su un
progetto Supabase che ora gestisce dati reali di un cliente (Pane Pizza Srl).
Non passare mai PAT o altre credenziali in chiaro in chat, né qui né con Claude
Code: usare sempre variabili d'ambiente o gestori di credenziali.

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

*Ultimo aggiornamento: 30 giugno 2026 — sessione Claude.ai SafeCheck (DOC-ALIGN-04, post Sprint 10)*
