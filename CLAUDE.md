# SafeCheck — Istruzioni per Claude Code

> ⚠️ Lo stack gira su Next.js 16 (App Router): può avere breaking changes rispetto a Next 14/15.
> Vedi `AGENTS.md` e i doc in `node_modules/next/dist/docs/` prima di scrivere codice Next.
> Nota: in Next 16 la auth pre-request usa il file `src/proxy.ts` (l'ex `middleware`).

## Progetto
Piattaforma web per sopralluoghi sicurezza sul lavoro (D.Lgs. 81/2008).
Sostituisce workflow Excel con app cloud multi-utente.

## Stack
- Framework: Next.js 16 App Router + React 19 + TypeScript
- Database: Supabase (PostgreSQL)
- ORM: Prisma 7
- Auth: Supabase Auth
- Storage: Supabase Storage (bucket privato)
- PDF: @react-pdf/renderer (server-side)
- Styling: Tailwind CSS v4
- Hosting: Vercel
- Email: Resend (da configurare)

## Struttura repo
- src/app/ — route Next.js (App Router)
- src/components/ — componenti React
- src/lib/ — logica business, queries, utils
- src/types/ — tipi TypeScript globali
- supabase/migrations/ — migration SQL
- seed/templates/ — JSON template checklist
- docs/ — documentazione progetto

## Dominio
- verbale: documento PDF di sopralluogo
- sopralluogo/visita: sessione di compilazione checklist
- NC: non conformità
- PC: parzialmente conforme
- RSPP: responsabile servizio prevenzione protezione
- D.Lgs. 81/2008: normativa italiana sicurezza lavoro

## Regole architetturali
- I PDF sono immutabili una volta generati
- Ogni verbale ha snapshot del template al momento della visita
- Le modifiche al template non impattano mai le visite passate
- I PDF sono in bucket Supabase privato, mai URL pubblici
- SHA256 di ogni PDF salvato in DB per verifica integrità
- Stati verbale: bozza → chiuso → sostituito
- Duplica disponibile solo da stato chiuso
- Crea sostitutivo disponibile solo da stato chiuso

## Template checklist
- 52 domande totali in 7 sezioni
- SEZ-01: 11 domande (con campi nominativo)
- SEZ-02: 7 domande
- SEZ-03: 10 domande (ordine gerarchico figure)
- SEZ-04: 7 domande
- SEZ-05: 7 domande
- SEZ-06: 5 domande
- SEZ-07: 5 domande
- Tipi risposta: conformita_5 (C/PC/NC/NV/NA) e qualita_4
- Azione correttiva appare solo per NC e PC
- Nominativi: singoli per DL e RSPP, multipli per tutte le altre figure

## Template system (3 livelli)
- Livello 1: template master SafeCheck (solo admin sistema)
- Livello 2: template cliente (fork del master, modificabile da admin e cliente)
- Livello 3: template sede (override opzionale, eredita dal cliente)
- Ogni modifica crea nuova versione, mai sovrascrittura
- Eliminare una domanda = disattivarla (active: false), mai cancellare

## Cosa NON fare
- Non usare localStorage (tutto in Supabase)
- Non generare PDF lato client (solo server-side)
- Non esporre URL pubblici per i PDF
- Non sovrascrivere versioni template esistenti
- Non modificare sopralluoghi in stato chiuso o sostituito

## Riferimenti
- Prototipo HTML: F:\StudioBilello\2026\safecheck\app\index.html
- Repo prototipo: github.com/VINS1388/safecheck
