# SafeCheck — Design Tokens

Censimento del design system in uso (Sprint 15.1). SafeCheck usa **Tailwind CSS v4**
(`@import "tailwindcss"` in `globals.css`), **senza** libreria di componenti
(nessun shadcn/ui, nessuna cartella `src/components/ui` prima di Sprint 15.1).
La UI è colocata nelle route; da Sprint 15.1 i componenti trasversali di stato
stanno in `src/components/ui/`.

## Colori brand

| Token | Valore | Uso |
|---|---|---|
| Brand primario | `#1e3a5f` (navy) | bottoni primari, link, accenti, header |
| Brand hover | `#16304e` | hover dei bottoni primari |
| Background app | `#f8f9fa` (`--background`) | sfondo pagina |
| Foreground | `#171717` (`--foreground`) | testo base |

`#1e3a5f` è usato come literal Tailwind (`bg-[#1e3a5f]`, `text-[#1e3a5f]`,
`border-[#1e3a5f]`, `bg-[#1e3a5f]/10`).

## Gerarchia colori di stato

Regola unica (Sprint 15.1): **verde = fatto/conforme · ambra = attenzione/parziale ·
rosso = critico/NC · grigio = incompleto/neutro · grigio scuro = archiviato/sostituito**.

### Stato verbale — `src/components/ui/StatoBadge.tsx` (fonte di verità unica)

| Stato | Classi | Semantica |
|---|---|---|
| bozza | `bg-gray-100 text-gray-600` | incompleto / in lavorazione |
| chiuso | `bg-green-100 text-green-700` | verbale valido |
| sostituito | `bg-slate-600 text-white` | archiviato, non più valido |

> Prima di Sprint 15.1 la bozza era **blu** (`bg-blue-100`) — default non
> deliberato. Unificata a **grigio** in tutti i punti (archivio, scheda cliente,
> scheda sede, header checklist).

### Esito checklist / PDF — coerente da Sprint 7+

| Esito | Colore | Classe testo/badge |
|---|---|---|
| C (conforme) | verde | `#16a34a` / `bg-green-600` |
| PC (parziale) | ambra | `#f59e0b` / `bg-amber-500` |
| NC (non conforme) | rosso | `#dc2626` / `bg-red-600` |
| NV / NA | grigio | `#6b7280` / `bg-gray-*` |

### Stato slot pianificazione — `PianificazioneClient` / `PianoVisiteForm`

Set **distinto** (dominio pianificazione, non verbali): `da_pianificare`
`bg-gray-100`, `pianificata` `bg-blue-100` (azionabile), `eseguita`
`bg-green-100`. Il blu qui è deliberato (stato "pianificata" = agganciabile),
non confligge con la gerarchia verbali.

Indicatore urgenza slot (bordo sinistro): rosso (scaduta) / ambra (≤30gg) /
verde (ok) / grigio (eseguita).

## Componenti e forme

| Elemento | Classi ricorrenti |
|---|---|
| Card | `rounded-xl border border-gray-200 bg-white shadow-sm` (padding `p-4`/`p-5`) |
| Bottone primario | `rounded-lg bg-[#1e3a5f] px-4 text-sm font-semibold text-white hover:bg-[#16304e]` |
| Bottone secondario | `rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50` |
| Input/select | `min-h-[44px] rounded-lg border border-gray-300 px-3 focus:ring-1 focus:ring-[#1e3a5f]` |
| Badge pill | `rounded-full px-2.5 py-0.5 text-xs font-semibold` |
| Empty state | `rounded-xl border border-dashed border-gray-300` (`src/components/ui/EmptyState.tsx`) |
| Loading | spinner `border-t-[#1e3a5f] animate-spin` (`(dashboard)/loading.tsx`) |

**Radius:** `rounded-xl` (card), `rounded-lg` (bottoni/input), `rounded-full`
(badge), `rounded-md` (note/alert). **Ombre:** `shadow-sm` sulle card.
**Target touch:** `min-h-[44px]` sui controlli usati in campo.

## Componenti condivisi (Sprint 15.1)

- `src/components/ui/StatoBadge.tsx` — badge stato verbale + helper `statoVerbaleUI()`.
- `src/components/ui/EmptyState.tsx` — empty state con CTA.
- `src/app/(dashboard)/loading.tsx` — loading spinner condiviso.

## Incoerenze risolte in Sprint 15.1

- **`BadgeVerbale` duplicato** verbatim (copia-incolla) in `visite/page.tsx` e
  `clienti/[id]/page.tsx` → estratto in `StatoBadge` condiviso.
- **Bozza blu → grigio** in tutti i punti (gerarchia stato corretta).
- **Empty state** disomogenei → componente `EmptyState` unico.
- **Accenti KPI** allineati (In bozza → ambra = attenzione).

## Incoerenze note ancora aperte

- I badge slot pianificazione usano un set proprio (blu per "pianificata"):
  deliberato, ma da rivalutare se in futuro si unifica tutto in un design system.
- Nessuna libreria di componenti: forme replicate via classi. Un'estrazione
  completa (Button/Card/Input condivisi) è un refactor futuro, fuori scope P1.

## Microcopy e lingua

Interfaccia interamente in **italiano**. Termini tecnici standard mantenuti
(PDF, email). Nessuna label in inglese nell'UI utente.
