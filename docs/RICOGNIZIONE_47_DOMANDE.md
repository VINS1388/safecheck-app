# Ricognizione tecnica — "47 domande" (modello `descrizione` / `note_tecnico`)

> **Natura del documento.** Artefatto di sola ricognizione (Sprint 18 · STEP 0 · F2).
> **Nessuna trasformazione dati è stata eseguita.** La migrazione descritta nella
> sezione 4 è una *proposta futura*, non implementata. Fonte dei dati: template
> `template_master` **modulo `sicurezza`, versione attiva v9** (lettura live del DB
> di produzione, 09/07/2026).

---

## 1. Sintesi

Il template sicurezza v9 contiene **67 domande** su 8 sezioni. Ogni domanda mostra
in UI un testo esplicativo che proviene da **due campi alternativi** dello snapshot:

- `descrizione` — fonte primaria (campo "moderno", introdotto da migration 009);
- `note_tecnico` — campo legacy usato come **fallback** quando `descrizione` è assente.

Stato attuale:

| Campo usato in UI | N. domande |
|---|---|
| `descrizione` valorizzata (fonte primaria) | **20** |
| solo `note_tecnico` (fallback) | **47** |
| **Totale** | **67** |

Le **47 domande in fallback** sono l'oggetto di questa ricognizione: funzionano
correttamente (il fallback le mostra), ma lasciano il modello dati disomogeneo.

> Il tema riguarda **solo il modulo sicurezza**. Il modulo `haccp_generico` (v1, 46
> domande) usa uno schema-domanda diverso (`guida`/`testo`/`titolo`/`categoria`/
> `note_template`) e **non** dipende da `descrizione`/`note_tecnico`.

---

## 2. Riconciliazione 20 + 47 = 67 (con provenienze)

Le 20 domande con `descrizione` valorizzata hanno due origini distinte:

| Origine | Sezioni | Domande | N. |
|---|---|---|---|
| **Migration 009** (`009_descrizione_domanda.sql`) — migrazione `note_tecnico → descrizione` delle domande SEZ-01/SEZ-06 con `rif_normativo` | SEZ-01, SEZ-06 | D-01-009, D-01-012, D-01-006, D-01-013, D-01-010, D-01-011, D-06-006, D-06-007 | **8** |
| **Native con `descrizione`** — domande introdotte *già* con il campo `descrizione` (nessun fallback) | SEZ-01 (sorveglianza, mig 016), SEZ-08 (appalti, mig 011) | D-01-014, D-01-015, D-01-016 (mig 016) · D-08-001…D-08-009 (mig 011) | **12** |
| | | **Totale con `descrizione`** | **20** |

Riconciliazione: **8 (mig 009) + 12 (native 011+016) = 20** con descrizione; **67 − 20 = 47** in fallback. ✔

> Nota: migration 009 **non** fa bump di versione (intervento in-place su
> `template_master`); non tocca gli snapshot già congelati.

---

## 3. Elenco puntuale delle 47 domande in fallback (per sezione)

> `testo` abbreviato per leggibilità; la fonte autorevole resta lo `struttura_json`.
> Le semantiche di sezione riportate sono quelle **live del template v9**.

### SEZ-01 — Nominativi figure della sicurezza (7)
| Codice | Testo (breve) |
|---|---|
| D-01-001 | È presente e documentato l'atto di nomina del RSPP? |
| D-01-002 | È presente e documentato l'atto di nomina del Medico Competente (ove previsto)? |
| D-01-003 | Sono presenti e documentate le nomine degli Addetti al Servizio di Prevenzione? |
| D-01-004 | Sono presenti e documentate le nomine degli Addetti Antincendio? |
| D-01-005 | Sono presenti e documentate le nomine degli Addetti al Primo Soccorso? |
| D-01-007 | Sono presenti aggiornamenti/revisioni delle nomine a seguito di variazioni? |
| D-01-008 | È presente documentazione relativa alla riunione periodica di prevenzione? |

### SEZ-02 — Documentazione obbligatoria (7)
| Codice | Testo (breve) |
|---|---|
| D-02-001 | È presente il Documento di Valutazione dei Rischi (DVR)? |
| D-02-002 | Il DVR risulta aggiornato a seguito di modifiche del processo produttivo? |
| D-02-003 | È disponibile il Piano di Emergenza ed Evacuazione (PEE)? |
| D-02-004 | Sono presenti i registri di verifica e manutenzione delle attrezzature? |
| D-02-005 | È disponibile il documento di valutazione del rischio incendio? |
| D-02-006 | Sono presenti e aggiornate le schede di sicurezza (SDS) delle sostanze? |
| D-02-008 | Sono presenti autorizzazioni/licenze/certificazioni obbligatorie? |

### SEZ-03 — Formazione (10)
| Codice | Testo (breve) |
|---|---|
| D-03-001 | Formazione lavoratori (generale + specifica + aggiornamento) |
| D-03-002 | Formazione preposti (12 ore + aggiornamento) |
| D-03-003 | Formazione dirigenti (12 ore + aggiornamento) |
| D-03-004 | Formazione Datore di Lavoro (corso 16 ore obbligatorio) |
| D-03-005 | Formazione DL che svolge direttamente i compiti del SPP (DL-SPP) |
| D-03-006 | Formazione RSPP (Moduli A+B+C se interno; requisiti se esterno) |
| D-03-007 | Formazione ASPP (Moduli A+B, se nominato) |
| D-03-008 | Formazione RLS (corso iniziale 32 ore + aggiornamento) |
| D-03-009 | Formazione Addetti Antincendio (corso per livello di rischio) |
| D-03-010 | Formazione Addetti Primo Soccorso (DM 388/2003 + aggiornamento) |

### SEZ-04 — Emergenze e presidi (7)
| Codice | Testo (breve) |
|---|---|
| D-04-001 | Sono presenti mezzi di estinzione portatili (estintori) in numero adeguato? |
| D-04-002 | Gli estintori risultano revisionati e con data di scadenza valida? |
| D-04-003 | È presente il presidio di primo soccorso (cassetta/pacchetto)? |
| D-04-004 | Le vie di esodo e le uscite di emergenza sono libere, segnalate, praticabili? |
| D-04-005 | È presente e funzionante l'illuminazione di emergenza? |
| D-04-006 | È presente un sistema di allarme antincendio adeguato? |
| D-04-007 | Sono affisse planimetrie aggiornate con vie di esodo e punti di raccolta? |

### SEZ-05 — Ambienti di lavoro (7)
| Codice | Testo (breve) |
|---|---|
| D-05-001 | Gli ambienti di lavoro sono in condizioni adeguate di pulizia e ordine? |
| D-05-002 | L'illuminazione degli ambienti e dei posti di lavoro è adeguata? |
| D-05-003 | La ventilazione degli ambienti è adeguata (naturale o meccanica)? |
| D-05-004 | Pavimenti, pareti e superfici di transito sono in condizioni idonee? |
| D-05-005 | Le scale fisse e portatili sono in condizioni sicure? |
| D-05-006 | I servizi igienici e gli spogliatoi sono in numero adeguato? |
| D-05-007 | La segnaletica di sicurezza è presente e adeguata? |

### SEZ-06 — Attrezzature e impianti (4)
| Codice | Testo (breve) |
|---|---|
| D-06-001 | Le attrezzature di lavoro sono idonee all'uso e in buono stato? |
| D-06-002 | Le attrezzature soggette a verifica periodica obbligatoria sono in regola? |
| D-06-003 | L'impianto elettrico è dotato di dichiarazione di conformità/rispondenza? |
| D-06-005 | Sono presenti procedure di manutenzione ordinaria e straordinaria? |

### SEZ-07 — DPI e procedure (5)
| Codice | Testo (breve) |
|---|---|
| D-07-001 | I DPI previsti dalla valutazione del rischio sono disponibili e idonei? |
| D-07-002 | I lavoratori sono informati e addestrati sull'uso corretto dei DPI? |
| D-07-003 | I DPI in uso sono in buono stato di conservazione? |
| D-07-004 | Esistono procedure operative documentate per le attività a rischio? |
| D-07-005 | Il comportamento osservato dei lavoratori è conforme? |

**Totale fallback: 7 + 7 + 10 + 7 + 7 + 4 + 5 = 47.** ✔

> **Nota di drift documentale (solo osservazione, nessuna azione):** le semantiche di
> sezione del template **v9 live** (SEZ-04 emergenze, SEZ-05 ambienti, SEZ-06
> attrezzature/impianti, SEZ-07 DPI) differiscono dalla tabella riassuntiva in
> `CLAUDE.md`. Non è oggetto di questo documento; segnalato per completezza.

---

## 4. I due punti UI del fallback (file:riga)

Il fallback `descrizione → note_tecnico` è implementato in **due** punti dell'UI
checklist (nessun altro consumatore; il PDF **non** stampa questi campi a livello
domanda):

1. `src/app/(dashboard)/visite/[id]/checklist/DomandaCard.tsx:151`
   `{domanda.descrizione?.trim() || domanda.note_tecnico}` (commento esplicativo alle righe 147-148).
2. `src/app/(dashboard)/visite/[id]/checklist/LavoratoriFormazione.tsx:40`
   stesso pattern (righe 38-40).

Riferimento tipo: `src/types/index.ts` — `descrizione` ("VISIBILE in UI, non stampato
nel PDF"), `note_tecnico` ("guida tecnica interna, legacy/fallback UI; mai stampata nel PDF").

PDF: `src/lib/pdf/generaVerbale.ts` stampa solo `d.testo` a livello domanda (non
`descrizione`/`note_tecnico`) → **una futura migrazione non ha alcun impatto sul PDF**.

---

## 5. Proposta di migration futura (NON implementata)

> Collocazione consigliata: **blocco checklist/scoring di fine roadmap** (coerente col
> rinvio delle revisioni strutturali). Bassissimo rischio, ma resta rimandata.

**Forma proposta.** Migration additiva JSONB su `template_master`, sullo stesso
modello della 009, che per le 47 domande residue del **modulo sicurezza** sposti il
valore da `note_tecnico` a `descrizione` (creando `descrizione` e rimuovendo
`note_tecnico`), uniformando il modello a quello adottato da migration 011 in poi.

**Vincoli obbligatori:**
- **Filtro `modulo_id`**: l'UPDATE su `template_master` deve filtrare per
  `modulo_id = <sicurezza>` E `attivo = true`, **mai solo `WHERE attivo = true`**
  (altrimenti toccherebbe template di altri moduli).
- **Snapshot intatti**: `visite.template_snapshot` è immutabile — la migration **non**
  li tocca. Le visite/verbali esistenti (censiti su snapshot v2/v4/v7/v9) restano
  invariati; il fallback UI continua a coprirli.
- **Nessun impatto PDF** (i verbali già generati non cambiano).
- **Bump versione**: da valutare in fase di design (la 009 non bumpò; qui, trattandosi
  di uniformazione contenutistica, il bump è opzionale e va deciso con Vincenzo).
- **Retrocompatibilità**: il fallback in `DomandaCard.tsx`/`LavoratoriFormazione.tsx`
  può restare a tempo indeterminato (copre gli snapshot congelati) → la migrazione è
  puramente di igiene del modello, non un requisito funzionale.

**Test previsti (quando implementata):** `BEGIN…ROLLBACK`, applicazione della migration
nella transazione, verifica che post-migration le 47 domande abbiano `descrizione`
valorizzata e `note_tecnico` assente sul solo template sicurezza attivo, che il conteggio
totale resti 67, e che altri moduli/template restino invariati.

---

## 6. Nota collegata — `punteggi_sezione` (infrastruttura dormiente)

Non fa parte del tema "47 domande" ma è un debito di modello adiacente da tenere a
registro:

- Tabella `punteggi_sezione` definita in `001_schema_iniziale.sql` (+ RLS in 002/025),
  **mai popolata dall'app** (confermato dal commento in `014_clona_visita.sql:18`:
  "non è mai popolata dall'app → non clonata"; nessun INSERT/SELECT applicativo).
  I punteggi mostrati sono calcolati **a runtime** (`src/lib/checklist/scoringHaccp.ts`,
  riepilogo).
- **Decisione DROP rimandata** al blocco checklist/scoring di fine roadmap (via
  esplicito, migration dedicata). Nessuna azione in questo sprint.

---

*Documento prodotto in Sprint 18 · STEP 0 · F2 — ricognizione, nessuna modifica dati.*
