# SafeCheck — Integration Contracts (v0, bozza)

## Principi

SafeCheck è **standalone-first**. Funziona autonomamente senza dipendenze da
piattaforme esterne.

- SafeCheck **non dipende** da Safety Risk Suite 2.0 (SRS2) o da qualsiasi altra
  piattaforma madre.
- L'integrazione futura è **prevista ma non implementata**.
- Nessun codice di produzione deve introdurre dipendenze da SRS2 prima che
  l'integrazione sia esplicitamente scoped in uno sprint dedicato.

## Raccordo con CLAUDE.md

CLAUDE.md **menziona** i contratti `SiteContext` / `AuditResult` (roadmap Sprint 18+
e "cosa NON fare") ma **non ne fornisce la definizione TypeScript**. Questo file è
quindi la **fonte unica** delle bozze v0 di tali contratti. Se in futuro le
definizioni venissero spostate/consolidate in CLAUDE.md o in SPECIFICHE_FUNZIONALI.md,
questo file dovrà **referenziarle senza duplicarle** (una sola fonte di verità).

## Interfacce future (solo documentali — non implementate)

> ⚠️ Bozze v0. Nessun endpoint, tipo esportato o import verso SRS2 esiste nel
> codice di produzione. Le forme qui sotto sono ipotesi di lavoro, soggette a
> modifica prima dell'implementazione.

### SiteContext.v0

Oggetto che SRS2 potrà **inviare a SafeCheck** per pre-popolare il contesto di una
visita (anagrafica cliente/sede, referenti, figure note). SafeCheck resterebbe
comunque libero di modificare/completare i dati in campo.

```typescript
interface SiteContextV0 {
  /** Versione del contratto (per evoluzione retrocompatibile). */
  contractVersion: "v0";

  /** Riferimento esterno lato SRS2 (idempotenza / correlazione). */
  externalRef: {
    system: "SRS2";
    siteId: string;      // id sede lato SRS2
    clientId: string;    // id cliente lato SRS2
  };

  cliente: {
    ragioneSociale: string;
    partitaIva?: string | null;
    codiceFiscale?: string | null;
  };

  sede: {
    nome: string;
    indirizzo: string;
    citta: string;
    cap?: string | null;
    provincia?: string | null;
  };

  referente?: {
    nome?: string | null;
    telefono?: string | null;
    email?: string | null;
  };

  /** Verticale/template suggerito (oggi solo "sicurezza_81_08"). */
  templateHint?: string;

  /** Figure della sicurezza già note, per pre-compilare SEZ-01 (opzionale). */
  figureNote?: Array<{
    figura: string;      // es. "RSPP", "MC", "PREPOSTI"
    nominativo: string;
  }>;

  /** Nota libera di contesto per il tecnico. */
  nota?: string | null;
}
```

### AuditResult.v0

Oggetto che SafeCheck potrà **restituire a SRS2** al termine di una visita (a
verbale chiuso). Riferisce il verbale immutabile senza esporre lo storage privato.

```typescript
interface AuditResultV0 {
  contractVersion: "v0";

  /** Correlazione con la richiesta originale di SRS2. */
  externalRef?: {
    system: "SRS2";
    siteId: string;
    clientId: string;
  };

  verbale: {
    id: string;              // id visita/verbale lato SafeCheck
    numero: string;          // es. "SC-2026-0001"
    dataVisita: string;      // ISO yyyy-mm-dd
    stato: "chiuso" | "sostituito";
    sostituisce?: string | null;   // numero verbale sostituito, se applicabile
  };

  /** Aggregato dei giudizi (coerente con i rilievi conclusivi del PDF). */
  esiti: {
    totali: { C: number; PC: number; NC: number; NV: number; NA: number };
    perSezione?: Array<{
      sezione: string;       // es. "SEZ-04"
      C: number; PC: number; NC: number; NV: number; NA: number;
    }>;
  };

  /**
   * Riferimento al PDF immutabile. Lo storage è un bucket privato: SRS2 NON
   * riceve un URL pubblico ma un handle da risolvere via API autenticata
   * SafeCheck (signed URL a scadenza), oppure l'hash per verifica di integrità.
   */
  pdf: {
    numero: string;
    sha256: string;          // metadato di integrità (mai il contenuto)
    downloadRef: string;     // handle interno, non un URL pubblico
  };
}
```

## Note di sicurezza sull'integrazione (pre-requisiti futuri)

- **PDF immutabile e privato**: l'`AuditResult` non espone mai URL pubblici né il
  binario; solo hash + handle risolvibile via API autenticata.
- **Multi-tenancy**: l'integrazione presuppone la separazione dati per
  organizzazione (oggi SafeCheck è single-tenant — vedi nota Sprint 15.1). Lo
  scambio con SRS2 dovrà essere tenant-scoped.
- **Comunicazione solo via API** tra progetti Supabase separati (nessun accesso
  DB diretto cross-progetto).

## Versione

**v0** — bozza iniziale, pre-integrazione. Soggetta a modifica prima
dell'implementazione. Nessuna parte di questo documento è vincolante per il
codice di produzione attuale.
