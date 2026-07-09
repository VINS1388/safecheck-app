# SafeCheck — Design Tokens & UI System

Riferimento operativo del design system, consolidato a chiusura dello **Sprint 16.5
(S1→S6)**. Stack: **Tailwind CSS v4** (`@import "tailwindcss"` in `globals.css`),
primitive proprietarie in **`src/components/ui/`** (nessuna libreria esterna).

Regola d'oro: **usa le primitive**. Non replicare a mano classi di card, bottoni,
input, badge, dialog o tabelle già coperti da una primitiva.

---

## 1. Token colore brand (`@theme` in `globals.css`)

| Token | Valore | Utility | Uso |
|---|---|---|---|
| `--color-brand` | `#1e3a5f` | `bg-brand`, `text-brand`, `border-brand`, `ring-brand`, `bg-brand/10`… | primari, link, accenti, ruolo **admin** |
| `--color-brand-hover` | `#16304e` | `hover:bg-brand-hover` | hover bottoni primari |
| `--color-brand-soft` | `#2c5480` | `bg-brand-soft`, `to-brand-soft` | gradient; ruolo **planner** |
| `--background` / `--foreground` | `#f8f9fa` / `#171717` | var CSS | sfondo / testo base |

In v4 anche i modificatori d'opacità (`bg-brand/10`) e i gradient (`from-brand
to-brand-soft`) derivano dai token. Non reintrodurre hex letterali (`bg-[#1e3a5f]`).

---

## 2. Primitive UI (`src/components/ui/`) — uso corretto

| Primitiva | Uso | Note chiave |
|---|---|---|
| `PageHeader` | intestazione di ogni pagina | `titolo` + `sottotitolo?` + `backHref?`/`backLabel?` + slot `azioni`. h1 `font-semibold`. |
| `Card` / `SectionCard` | contenitori e sezioni | `Card` neutro; `SectionCard` con `titolo`/`sottotitolo`/`azione`. Base `rounded-xl border-gray-200 bg-white shadow-sm`. |
| `Button` / `buttonClasses()` | azioni | varianti `primary` · `secondary` · `ghost` · `danger`; size `md`/`lg`. `min-h-[44px]` incorporato. Usa `buttonClasses(...)` per stilizzare un `<Link>` o un `<button type="submit">`. |
| `Badge` | pill di stato | tono semantico: `neutral` grigio · `success` verde · `warning` ambra · `danger` rosso · `brand` navy tenue · `archived` slate. |
| `RoleBadge` | ruolo utente | tinte del **navy** (admin=`bg-brand`, planner=`bg-brand-soft`, specialist=`bg-brand/10`). `etichetta` per label custom (es. "Amministratore"). |
| `StatoBadge` | stato verbale | fonte di verità + helper `statoVerbaleUI()`. |
| `AlertBanner` | messaggi success/error/warning/info | `variant` + `role="alert"|"status"`. Sostituisce ogni box messaggio ad-hoc. |
| `DataTable` | liste | tabella `sm:`↑ / card mobile automatica. `columns` + `renderCard?` + `vuoto` (EmptyState). |
| `Field` + `Input`/`Textarea`/`Select` | form | `Field` = label+required+descrizione+errore; controlli `rounded-lg`, `text-base` (no zoom iOS), `min-h-[44px]`. |
| `EmptyState` | stati vuoti | `titolo` + `descrizione?` + CTA opzionale. Copy onesto (mai promettere feature inesistenti). |
| `ConfirmDialog` | dialoghi conferma / form modali | chrome unica (overlay + bottom-sheet mobile / centrato desktop). Presentazionale e controllato: `aperto`/`onChiudi`/`titolo`/`sottotitolo?`/`children` + `onConferma`/`confermaDisabilitata`/`variante` **oppure** slot `azioni` per controllo totale (busy/error/result gestiti dal chiamante). |

### ConfirmDialog — pattern di adozione (S6)

- **Conferma semplice**: `onConferma` + `testoConferma`/`confermaDisabilitata` + `variante`.
- **Async con busy/errore/result** (Organizzazione): usa lo slot `azioni` con `<Button>`
  espliciti; gestisci `busy`, `{ok,error}`, `router.refresh()` e permessi nel chiamante.
- **Form modale**: `<form id="x">` in `children`, submit in `azioni` via
  `<button type="submit" form="x">` (validazione HTML + Enter preservati).
- Anti-lockout, fetch dipendenze, disabled: restano nel chiamante, il dialog non li tocca.

---

## 3. Gerarchia colori di stato

**verde = fatto/conforme · ambra = attenzione/parziale · rosso = critico/NC ·
grigio = incompleto/neutro · slate = archiviato/sostituito.** I ruoli **non** usano
questi colori: usano tinte del navy (vedi RoleBadge).

| Dominio | Sorgente | Valori |
|---|---|---|
| Stato verbale | `StatoBadge` | bozza `neutral` · chiuso `success` · sostituito `archived` |
| Stato utente | `StatoBadge`-tone via `Badge` | attivo `success` · disattivato `neutral` (grigio, `text-gray-600`) |
| Esito checklist/PDF | costanti | C verde · PC ambra · NC rosso · NV/NA grigio |
| Stato slot pianificazione | dominio dedicato | `da_pianificare` grigio · `pianificata` blu (azionabile, deliberato) · `eseguita` verde |

> Stato utente e ruolo sono **assi separati**: il RoleBadge dà il ruolo, il Badge
> di stato dà attivo/disattivato. Mai fondere i due.

---

## 4. Regole mobile-first

- Target touch ≥ **44px** su ogni controllo (già nelle primitive Button/Field).
- Liste: **DataTable** (tabella desktop / card mobile), mai una tabella schiacciata su mobile.
- Form: griglie sempre responsive — `grid-cols-1 sm:grid-cols-N` (mai `grid-cols-N` nudo).
- Input `text-base` (16px) per evitare lo zoom automatico iOS al focus.
- Dialog: bottom-sheet su mobile (`items-end`), centrato da `sm:` (gestito da ConfirmDialog).

---

## 5. Radius / ombre / geometria

`rounded-xl` card · `rounded-lg` bottoni/input · `rounded-full` badge · `rounded-md`
alert/dialog interni. Ombra `shadow-sm` sulle card.

---

## 6. Microcopy e linguaggio errori

- UI interamente in **italiano**; termini tecnici standard mantenuti (PDF, email).
- **Nessun errore grezzo Supabase/Postgres** all'utente. Messaggi mappati (helper
  `messaggioErrore` in `organizzazione/actions.ts`), coerenti tra Organizzazione e Profilo:
  - email duplicata → «Esiste già un utente con questa email.»
  - permessi → «Non hai i permessi per modificare questo utente.»
  - anti-lockout → «Deve rimanere almeno un admin attivo.»
  - generico → «Operazione non completata. Riprova o verifica i dati inseriti.»
- Successi brevi e non tecnici (es. «Profilo aggiornato.»), resi con `AlertBanner`.

---

## 7. Cosa EVITARE

- ❌ Classi bespoke che duplicano una primitiva (`inputCls` locale, `btnPrimary`
  inline, card/tabella ricopiate a mano).
- ❌ Colori hardcoded/off-palette: hex `bg-[#…]` al posto dei token; purple/blue/teal
  per i ruoli (usare RoleBadge navy); `text-gray-500` per stati (usare `Badge` tone).
- ❌ Modali clonate a mano: usare `ConfirmDialog` (chrome unica). Nessun secondo
  sistema di modali parallelo.
- ❌ `window.confirm` dove `ConfirmDialog` è applicabile.
- ❌ `grid-cols-N` senza breakpoint `sm:` nei form.
- ❌ EmptyState che implica funzionalità non esistenti.

---

## 8. Residui hardcoded noti (intenzionali)

- `src/lib/pdf/generaVerbale.ts` — hex per **PDFKit** (server-side, nessun layer CSS):
  centralizzati come costanti. Non tokenizzabili via CSS. Restano.
- Stato slot pianificazione: set colore proprio (blu "pianificata" deliberato).
- `window.confirm` residui (fuori dai casi ConfirmDialog attuali): vedi `AzioniVerbale`
  (elimina bozza) e `PianoVisiteForm` (ricalcolo piano) — conferme **client con
  gestione risultato/busy** non ancora astratte in una primitiva async dedicata.

---

*Chiusura Sprint 16.5 (S1 token → S2 primitive → S3 mobile → S4 dashboard → S5 CRUD
polish → S6 Organizzazione/Profilo). Questo file è documentale: aggiornarlo quando il
sistema UI cambia davvero.*
