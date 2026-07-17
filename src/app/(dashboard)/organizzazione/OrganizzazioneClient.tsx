"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import Button, { buttonClasses } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import RoleBadge from "@/components/ui/RoleBadge";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  creaUtenteAction,
  cambiaRuoloAction,
  impostaAttivoAction,
  resetPasswordAction,
  contaSlotFuturiTecnicoAction,
  aggiornaAnagraficaUtenteAction,
  aggiornaProfiloOrganizzazioneAction,
  dipendenzeUtenteAction,
  eliminaUtenteFisicoAction,
} from "./actions";
import type { DipendenzeUtente } from "@/lib/server/organizzazione";
import type { RuoloUtente, UtenteLista, UtenteConMembership } from "@/lib/server/organizzazione";
import type { ProfiloOrganizzazione } from "@/lib/server/org-profilo";

// ── Costanti presentazione ───────────────────────────────────────────────────
const RUOLO_LABEL: Record<RuoloUtente, string> = {
  admin: "Amministratore",
  planner: "Pianificatore",
  specialist: "Tecnico",
};
const RUOLI: RuoloUtente[] = ["admin", "planner", "specialist"];
const LOCKOUT_MSG =
  "Deve rimanere almeno un admin attivo.";

function formattaData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

interface Riepilogo {
  attivi: number;
  admin: number;
  planner: number;
  specialist: number;
}

type ModalState =
  | { type: "aggiungi" }
  | { type: "org" }
  | { type: "anagrafica"; utente: UtenteLista }
  | { type: "ruolo"; utente: UtenteLista }
  | { type: "reset"; utente: UtenteLista }
  | { type: "stato"; utente: UtenteLista }
  | { type: "elimina"; utente: UtenteLista }
  | null;

type PasswordReveal = { titolo: string; sottotitolo: string; password: string } | null;

export default function OrganizzazioneClient({
  utenti,
  riepilogo,
  organizzazione,
}: {
  utenti: UtenteConMembership[];
  riepilogo: Riepilogo;
  organizzazione: ProfiloOrganizzazione | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filtroRuolo, setFiltroRuolo] = useState<"tutti" | RuoloUtente>("tutti");
  const [filtroStato, setFiltroStato] = useState<"tutti" | "attivi" | "disattivati">("tutti");
  const [modal, setModal] = useState<ModalState>(null);
  const [reveal, setReveal] = useState<PasswordReveal>(null);

  // Ultimo admin attivo: se ne esiste esattamente uno, il suo id è "protetto".
  const lastActiveAdminId = useMemo(() => {
    const attiviAdmin = utenti.filter((u) => u.attivo && u.ruolo === "admin");
    return attiviAdmin.length === 1 ? attiviAdmin[0].id : null;
  }, [utenti]);

  const filtrati = useMemo(() => {
    const q = query.trim().toLowerCase();
    return utenti.filter((u) => {
      if (q && !u.nome_completo.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q))
        return false;
      if (filtroRuolo !== "tutti" && u.ruolo !== filtroRuolo) return false;
      if (filtroStato === "attivi" && !u.attivo) return false;
      if (filtroStato === "disattivati" && u.attivo) return false;
      return true;
    });
  }, [utenti, query, filtroRuolo, filtroStato]);

  const chiudiModal = () => setModal(null);
  const dopoMutazione = () => {
    chiudiModal();
    router.refresh();
  };

  const columns: Column<UtenteConMembership>[] = [
    {
      header: "Utente",
      cell: (u) => (
        <div>
          <p className="font-medium text-gray-900">{u.nome_completo}</p>
          <p className="text-xs text-gray-500">{u.email}</p>
        </div>
      ),
    },
    { header: "Ruolo", cell: (u) => <RoleBadge ruolo={u.ruolo} etichetta={RUOLO_LABEL[u.ruolo]} /> },
    { header: "Stato", cell: (u) => <StatoUtente attivo={u.attivo} /> },
    { header: "Membership", cell: (u) => <MembershipStato stato={u.membershipStato} /> },
    { header: "Creato", className: "text-gray-500", cell: (u) => formattaData(u.creato_il) },
    {
      header: "Azioni",
      align: "right",
      cell: (u) => (
        <RigaAzioni
          utente={u}
          isLastAdmin={u.id === lastActiveAdminId}
          onModifica={() => setModal({ type: "anagrafica", utente: u })}
          onRuolo={() => setModal({ type: "ruolo", utente: u })}
          onReset={() => setModal({ type: "reset", utente: u })}
          onStato={() => setModal({ type: "stato", utente: u })}
          onElimina={() => setModal({ type: "elimina", utente: u })}
        />
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        titolo="Organizzazione"
        sottotitolo="Gestisci utenti, ruoli e accessi alla piattaforma."
        azioni={
          <Button onClick={() => setModal({ type: "aggiungi" })}>+ Aggiungi utente</Button>
        }
      />

      {/* Profilo Organizzazione (dati reali, migration 031). Lettura: tutti;
          scrittura: admin — qui siamo in area admin-only, quindi editabile. */}
      <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-brand to-brand-soft p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-white/60">Organizzazione corrente</p>
            <p className="mt-0.5 text-lg font-semibold">
              {organizzazione?.ragione_sociale ?? "—"}
            </p>
            {organizzazione && (
              <p className="mt-1 text-sm text-white/70">
                {[
                  organizzazione.partita_iva ? `P.IVA ${organizzazione.partita_iva}` : null,
                  [organizzazione.citta, organizzazione.provincia].filter(Boolean).join(" ") || null,
                  organizzazione.email,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Completa i dati dell'organizzazione."}
              </p>
            )}
          </div>
          {organizzazione && (
            <button
              type="button"
              onClick={() => setModal({ type: "org" })}
              className="flex-shrink-0 rounded-md border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              Modifica
            </button>
          )}
        </div>
      </div>

      {/* Riepilogo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Utenti attivi" valore={riepilogo.attivi} />
        <StatTile label="Amministratori" valore={riepilogo.admin} />
        <StatTile label="Pianificatori" valore={riepilogo.planner} />
        <StatTile label="Tecnici" valore={riepilogo.specialist} />
      </div>

      {/* Ricerca + filtri */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome o email…"
          className="sm:max-w-xs"
        />
        <div className="flex gap-3">
          <Select
            value={filtroRuolo}
            onChange={(e) => setFiltroRuolo(e.target.value as "tutti" | RuoloUtente)}
            aria-label="Filtra per ruolo"
          >
            <option value="tutti">Tutti i ruoli</option>
            {RUOLI.map((r) => (
              <option key={r} value={r}>
                {RUOLO_LABEL[r]}
              </option>
            ))}
          </Select>
          <Select
            value={filtroStato}
            onChange={(e) => setFiltroStato(e.target.value as "tutti" | "attivi" | "disattivati")}
            aria-label="Filtra per stato"
          >
            <option value="tutti">Tutti gli stati</option>
            <option value="attivi">Solo attivi</option>
            <option value="disattivati">Solo disattivati</option>
          </Select>
        </div>
      </div>

      {/* Nota Membership (Sprint 19.D): distingue lo stato della membership
          nell'org corrente dallo stato dell'account, in vista del multi-org. */}
      <p className="text-xs text-gray-400">
        La colonna «Membership» mostra lo stato dell&apos;appartenenza
        all&apos;organizzazione corrente (organizzazione_membri), distinto dallo stato
        dell&apos;account (utenti.attivo). Oggi i due coincidono; la distinzione
        diventerà rilevante con il multi-organizzazione.
      </p>

      {/* Lista */}
      <DataTable
        columns={columns}
        rows={filtrati}
        keyOf={(u) => u.id}
        renderCard={(u) => (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{u.nome_completo}</p>
                <p className="truncate text-xs text-gray-500">{u.email}</p>
              </div>
              <StatoUtente attivo={u.attivo} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RoleBadge ruolo={u.ruolo} etichetta={RUOLO_LABEL[u.ruolo]} />
              <MembershipStato stato={u.membershipStato} />
              <span className="text-xs text-gray-400">· creato {formattaData(u.creato_il)}</span>
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3">
              <RigaAzioni
                utente={u}
                isLastAdmin={u.id === lastActiveAdminId}
                onModifica={() => setModal({ type: "anagrafica", utente: u })}
                onRuolo={() => setModal({ type: "ruolo", utente: u })}
                onReset={() => setModal({ type: "reset", utente: u })}
                onStato={() => setModal({ type: "stato", utente: u })}
                onElimina={() => setModal({ type: "elimina", utente: u })}
              />
            </div>
          </div>
        )}
        vuoto={
          <EmptyState
            titolo="Nessun utente trovato"
            descrizione={
              utenti.length === 0
                ? "Aggiungi il primo utente dell'organizzazione."
                : "Nessun utente corrisponde ai filtri selezionati."
            }
          />
        }
      />

      {/* Dialoghi */}
      {modal?.type === "aggiungi" && (
        <DialogAggiungi
          onClose={chiudiModal}
          onSuccess={(nome, email, password) => {
            setModal(null);
            setReveal({
              titolo: "Utente creato",
              sottotitolo: `${nome} · ${email}`,
              password,
            });
            router.refresh();
          }}
        />
      )}
      {modal?.type === "org" && organizzazione && (
        <DialogModificaOrganizzazione org={organizzazione} onClose={chiudiModal} onDone={dopoMutazione} />
      )}
      {modal?.type === "anagrafica" && (
        <DialogModificaUtente utente={modal.utente} onClose={chiudiModal} onDone={dopoMutazione} />
      )}
      {modal?.type === "ruolo" && (
        <DialogRuolo
          utente={modal.utente}
          isLastAdmin={modal.utente.id === lastActiveAdminId}
          onClose={chiudiModal}
          onDone={dopoMutazione}
        />
      )}
      {modal?.type === "reset" && (
        <DialogReset
          utente={modal.utente}
          onClose={chiudiModal}
          onSuccess={(password) => {
            setModal(null);
            setReveal({
              titolo: "Password reimpostata",
              sottotitolo: `${modal.utente.nome_completo} · ${modal.utente.email}`,
              password,
            });
          }}
        />
      )}
      {modal?.type === "stato" && (
        <DialogStato utente={modal.utente} onClose={chiudiModal} onDone={dopoMutazione} />
      )}
      {modal?.type === "elimina" && (
        <DialogElimina utente={modal.utente} onClose={chiudiModal} onDone={dopoMutazione} />
      )}
      {reveal && (
        <DialogPassword
          titolo={reveal.titolo}
          sottotitolo={reveal.sottotitolo}
          password={reveal.password}
          onClose={() => {
            setReveal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Sotto-componenti presentazione ───────────────────────────────────────────
function StatTile({ label, valore }: { label: string; valore: number }) {
  return (
    <Card padding="md">
      <p className="text-2xl font-bold text-gray-900">{valore}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </Card>
  );
}

// Stato utente = STATO (non ruolo): tono semantico del design system.
// Attivo = success (verde) · disattivato = neutral (grigio, text-gray-600 via Badge).
function StatoUtente({ attivo }: { attivo: boolean }) {
  return <Badge tone={attivo ? "success" : "neutral"}>{attivo ? "Attivo" : "Disattivato"}</Badge>;
}

// Stato della membership nell'org corrente (organizzazione_membri.stato), read-only.
// attivo = success · sospeso = warning · assente = neutral "—" (nessuna membership).
function MembershipStato({ stato }: { stato: string | null }) {
  if (stato === "attivo") return <Badge tone="success">Attiva</Badge>;
  if (stato === "sospeso") return <Badge tone="warning">Sospesa</Badge>;
  if (stato) return <Badge tone="neutral">{stato}</Badge>;
  return (
    <Badge tone="neutral" title="Nessuna membership nell'organizzazione corrente">
      —
    </Badge>
  );
}

function RigaAzioni({
  utente,
  isLastAdmin,
  onModifica,
  onRuolo,
  onReset,
  onStato,
  onElimina,
}: {
  utente: UtenteLista;
  isLastAdmin: boolean;
  onModifica: () => void;
  onRuolo: () => void;
  onReset: () => void;
  onStato: () => void;
  onElimina: () => void;
}) {
  const azioneStatoBloccata = utente.attivo && isLastAdmin; // disattivare l'ultimo admin
  const azioneLink = "min-h-[36px] rounded-md px-2.5 py-1.5 text-xs font-medium";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={onModifica} className={`${azioneLink} text-brand hover:bg-brand/10`}>
        Modifica
      </button>
      <button type="button" onClick={onRuolo} className={`${azioneLink} text-brand hover:bg-brand/10`}>
        Ruolo
      </button>
      <button type="button" onClick={onReset} className={`${azioneLink} text-brand hover:bg-brand/10`}>
        Reset password
      </button>
      {utente.attivo ? (
        <button
          type="button"
          onClick={onStato}
          disabled={azioneStatoBloccata}
          title={azioneStatoBloccata ? LOCKOUT_MSG : undefined}
          className={`${azioneLink} text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent`}
        >
          Disattiva
        </button>
      ) : (
        <button type="button" onClick={onStato} className={`${azioneLink} text-green-700 hover:bg-green-50`}>
          Riattiva
        </button>
      )}
      <button type="button" onClick={onElimina} className={`${azioneLink} text-red-600 hover:bg-red-50`}>
        Elimina
      </button>
    </div>
  );
}

// ── Dialog: aggiungi utente ──────────────────────────────────────────────────
function DialogAggiungi({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (nome: string, email: string, password: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [ruolo, setRuolo] = useState<RuoloUtente>("specialist");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setBusy(true);
    const res = await creaUtenteAction({ nome, email, ruolo });
    if (res.ok) {
      onSuccess(res.nome, res.email, res.tempPassword);
    } else {
      setErrore(res.error);
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      aperto
      onChiudi={onClose}
      titolo="Aggiungi utente"
      azioni={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <button type="submit" form="form-aggiungi-utente" className={buttonClasses("primary")} disabled={busy}>
            {busy ? "Creazione…" : "Crea utente"}
          </button>
        </>
      }
    >
      <form id="form-aggiungi-utente" onSubmit={submit} className="space-y-4">
        <Field label="Nome completo" required>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Mario Rossi" />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="mario.rossi@studio.it" />
        </Field>
        <Field label="Ruolo">
          <Select value={ruolo} onChange={(e) => setRuolo(e.target.value as RuoloUtente)}>
            {RUOLI.map((r) => (
              <option key={r} value={r}>
                {RUOLO_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        {errore && <AlertBanner variant="danger" role="alert">{errore}</AlertBanner>}
      </form>
    </ConfirmDialog>
  );
}

// ── Dialog: modifica profilo Organizzazione (solo admin) ─────────────────────
function DialogModificaOrganizzazione({
  org,
  onClose,
  onDone,
}: {
  org: ProfiloOrganizzazione;
  onClose: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    ragione_sociale: org.ragione_sociale,
    partita_iva: org.partita_iva ?? "",
    codice_fiscale: org.codice_fiscale ?? "",
    indirizzo: org.indirizzo ?? "",
    citta: org.citta ?? "",
    cap: org.cap ?? "",
    provincia: org.provincia ?? "",
    email: org.email ?? "",
    telefono: org.telefono ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));
  const nn = (v: string) => v.trim() || null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setBusy(true);
    const res = await aggiornaProfiloOrganizzazioneAction({
      ragione_sociale: f.ragione_sociale,
      partita_iva: nn(f.partita_iva),
      codice_fiscale: nn(f.codice_fiscale),
      indirizzo: nn(f.indirizzo),
      citta: nn(f.citta),
      cap: nn(f.cap),
      provincia: nn(f.provincia),
      email: nn(f.email),
      telefono: nn(f.telefono),
    });
    if (res.ok) onDone();
    else {
      setErrore(res.error);
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      aperto
      onChiudi={onClose}
      titolo="Profilo organizzazione"
      sottotitolo="Dati dello studio, visibili a tutti gli utenti"
      azioni={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <button type="submit" form="form-org" className={buttonClasses("primary")} disabled={busy}>
            {busy ? "Salvataggio…" : "Salva"}
          </button>
        </>
      }
    >
      <form id="form-org" onSubmit={submit} className="space-y-4">
        <Field label="Ragione sociale" required>
          <Input value={f.ragione_sociale} onChange={set("ragione_sociale")} required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Partita IVA">
            <Input value={f.partita_iva} onChange={set("partita_iva")} />
          </Field>
          <Field label="Codice fiscale">
            <Input value={f.codice_fiscale} onChange={set("codice_fiscale")} />
          </Field>
        </div>
        <Field label="Indirizzo">
          <Input value={f.indirizzo} onChange={set("indirizzo")} />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          <Field label="Città" className="col-span-2 sm:col-span-3">
            <Input value={f.citta} onChange={set("citta")} />
          </Field>
          <Field label="CAP" className="col-span-1">
            <Input value={f.cap} onChange={set("cap")} />
          </Field>
          <Field label="Provincia" className="col-span-1 sm:col-span-2">
            <Input maxLength={2} value={f.provincia} onChange={set("provincia")} className="uppercase" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input type="email" value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Telefono">
            <Input value={f.telefono} onChange={set("telefono")} />
          </Field>
        </div>
        {errore && <AlertBanner variant="danger" role="alert">{errore}</AlertBanner>}
      </form>
    </ConfirmDialog>
  );
}

// ── Dialog: modifica anagrafica (nome/telefono/qualifica) ────────────────────
function DialogModificaUtente({
  utente,
  onClose,
  onDone,
}: {
  utente: UtenteLista;
  onClose: () => void;
  onDone: () => void;
}) {
  const [nome, setNome] = useState(utente.nome_completo);
  const [telefono, setTelefono] = useState(utente.telefono ?? "");
  const [qualifica, setQualifica] = useState(utente.qualifica ?? "");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setBusy(true);
    const res = await aggiornaAnagraficaUtenteAction(utente.id, {
      nome_completo: nome,
      telefono: telefono.trim() || null,
      qualifica: qualifica.trim() || null,
    });
    if (res.ok) onDone();
    else {
      setErrore(res.error);
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      aperto
      onChiudi={onClose}
      titolo="Modifica dati utente"
      sottotitolo={utente.email}
      azioni={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <button type="submit" form="form-anagrafica" className={buttonClasses("primary")} disabled={busy}>
            {busy ? "Salvataggio…" : "Salva"}
          </button>
        </>
      }
    >
      <form id="form-anagrafica" onSubmit={submit} className="space-y-4">
        <Field label="Nome completo" required>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Telefono">
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Field>
          <Field label="Qualifica">
            <Input value={qualifica} onChange={(e) => setQualifica(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-gray-400">
          Ruolo, stato ed email non si modificano da qui (email non è modificabile).
        </p>
        {errore && <AlertBanner variant="danger" role="alert">{errore}</AlertBanner>}
      </form>
    </ConfirmDialog>
  );
}

// ── Dialog: cambio ruolo ─────────────────────────────────────────────────────
function DialogRuolo({
  utente,
  isLastAdmin,
  onClose,
  onDone,
}: {
  utente: UtenteLista;
  isLastAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [ruolo, setRuolo] = useState<RuoloUtente>(utente.ruolo);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Retrocessione dell'ultimo admin attivo: vietata.
  const retrocessioneVietata = isLastAdmin && ruolo !== "admin";
  const invariato = ruolo === utente.ruolo;

  async function conferma() {
    setErrore(null);
    setBusy(true);
    const res = await cambiaRuoloAction(utente.id, ruolo);
    if (res.ok) onDone();
    else {
      setErrore(res.error);
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      aperto
      onChiudi={onClose}
      titolo="Modifica ruolo"
      sottotitolo={`${utente.nome_completo} · ${utente.email}`}
      azioni={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={conferma} disabled={busy || invariato || retrocessioneVietata}>
            {busy ? "Salvataggio…" : "Conferma"}
          </Button>
        </>
      }
    >
      <Field label="Nuovo ruolo">
        <Select value={ruolo} onChange={(e) => setRuolo(e.target.value as RuoloUtente)}>
          {RUOLI.map((r) => (
            <option key={r} value={r}>
              {RUOLO_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      {!invariato && !retrocessioneVietata && (
        <p>
          Stai modificando il ruolo di <strong>{utente.nome_completo}</strong> da{" "}
          {RUOLO_LABEL[utente.ruolo]} a {RUOLO_LABEL[ruolo]}. Confermi?
        </p>
      )}
      {retrocessioneVietata && <AlertBanner variant="danger" role="alert">{LOCKOUT_MSG}</AlertBanner>}
      {errore && <AlertBanner variant="danger" role="alert">{errore}</AlertBanner>}
    </ConfirmDialog>
  );
}

// ── Dialog: reset password ───────────────────────────────────────────────────
function DialogReset({
  utente,
  onClose,
  onSuccess,
}: {
  utente: UtenteLista;
  onClose: () => void;
  onSuccess: (password: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function conferma() {
    setErrore(null);
    setBusy(true);
    const res = await resetPasswordAction(utente.id);
    if (res.ok) onSuccess(res.tempPassword);
    else {
      setErrore(res.error);
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      aperto
      onChiudi={onClose}
      titolo="Reset password"
      sottotitolo={`${utente.nome_completo} · ${utente.email}`}
      azioni={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={conferma} disabled={busy}>
            {busy ? "Generazione…" : "Reimposta password"}
          </Button>
        </>
      }
    >
      <p>
        Verrà generata una nuova password temporanea per{" "}
        <strong>{utente.nome_completo}</strong>. La password attuale smetterà di funzionare
        immediatamente. Confermi?
      </p>
      {errore && <AlertBanner variant="danger" role="alert">{errore}</AlertBanner>}
    </ConfirmDialog>
  );
}

// ── Dialog: attiva/disattiva ─────────────────────────────────────────────────
function DialogStato({
  utente,
  onClose,
  onDone,
}: {
  utente: UtenteLista;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const disattiva = utente.attivo;

  // Avviso non bloccante: quanti slot futuri restano assegnati a questo tecnico se
  // lo disattiviamo. Solo in disattivazione; null = non ancora noto (nessun avviso).
  const [slotImpattati, setSlotImpattati] = useState<number | null>(null);
  useEffect(() => {
    if (!disattiva) return;
    let vivo = true;
    contaSlotFuturiTecnicoAction(utente.id).then((r) => {
      if (vivo && r.ok) setSlotImpattati(r.count);
    });
    return () => {
      vivo = false;
    };
  }, [disattiva, utente.id]);

  async function conferma() {
    setErrore(null);
    setBusy(true);
    const res = await impostaAttivoAction(utente.id, !utente.attivo);
    if (res.ok) onDone();
    else {
      setErrore(res.error);
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      aperto
      onChiudi={onClose}
      titolo={disattiva ? "Disattiva utente" : "Riattiva utente"}
      sottotitolo={`${utente.nome_completo} · ${utente.email}`}
      azioni={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button variant={disattiva ? "danger" : "primary"} onClick={conferma} disabled={busy}>
            {busy ? "Attendere…" : disattiva ? "Disattiva" : "Riattiva"}
          </Button>
        </>
      }
    >
      <p>
        {disattiva ? (
          <>
            <strong>{utente.nome_completo}</strong> non potrà più accedere alla piattaforma finché
            non verrà riattivato. Confermi?
          </>
        ) : (
          <>
            <strong>{utente.nome_completo}</strong> potrà nuovamente accedere alla piattaforma.
            Confermi?
          </>
        )}
      </p>
      {disattiva && slotImpattati != null && slotImpattati > 0 && (
        <AlertBanner variant="warning">
          {slotImpattati === 1
            ? "1 slot di pianificazione futuro è assegnato a questo tecnico. Resterà assegnato a lui, segnalato come «Tecnico disattivato» nella pianificazione, finché non lo riassegni manualmente. La disattivazione non lo rimuove."
            : `${slotImpattati} slot di pianificazione futuri sono assegnati a questo tecnico. Resteranno assegnati a lui, segnalati come «Tecnico disattivato» nella pianificazione, finché non li riassegni manualmente. La disattivazione non li rimuove.`}
        </AlertBanner>
      )}
      {errore && <AlertBanner variant="danger" role="alert">{errore}</AlertBanner>}
    </ConfirmDialog>
  );
}

// ── Dialog: eliminazione FISICA utente (solo se pulito) ──────────────────────
function DialogElimina({
  utente,
  onClose,
  onDone,
}: {
  utente: UtenteLista;
  onClose: () => void;
  onDone: () => void;
}) {
  const [dip, setDip] = useState<DipendenzeUtente | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    dipendenzeUtenteAction(utente.id).then((r) => {
      if (!vivo) return;
      if (r.ok) setDip(r.dip);
      else setErrore(r.error);
      setCaricando(false);
    });
    return () => {
      vivo = false;
    };
  }, [utente.id]);

  async function conferma() {
    setErrore(null);
    setBusy(true);
    const res = await eliminaUtenteFisicoAction(utente.id);
    if (res.ok) onDone();
    else {
      setErrore(res.error);
      setBusy(false);
    }
  }

  const blocchi = dip
    ? [
        dip.visite ? `${dip.visite} visite` : null,
        dip.slot ? `${dip.slot} slot` : null,
        dip.piani ? `${dip.piani} piani` : null,
        dip.verbali ? `${dip.verbali} verbali` : null,
        dip.clientiCreati ? `${dip.clientiCreati} clienti creati` : null,
        dip.template ? "riferimenti template" : null,
        dip.audit ? "voci di audit" : null,
      ].filter(Boolean)
    : [];

  return (
    <ConfirmDialog
      aperto
      onChiudi={onClose}
      titolo="Elimina definitivamente"
      sottotitolo={`${utente.nome_completo} · ${utente.email}`}
      azioni={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button variant="danger" onClick={conferma} disabled={busy || caricando || !dip?.eliminabile}>
            {busy ? "Eliminazione…" : "Elimina definitivamente"}
          </Button>
        </>
      }
    >
      {caricando ? (
        <p className="text-gray-500">Verifica dei dati collegati…</p>
      ) : dip?.eliminabile ? (
        <p>
          L&apos;utente non ha dati collegati. L&apos;eliminazione è definitiva e{" "}
          <strong>non reversibile</strong>. Per un utente con storico usa invece la disattivazione.
        </p>
      ) : (
        <AlertBanner variant="warning">
          Non eliminabile: l&apos;utente ha {blocchi.join(", ")}. Usa la disattivazione per
          revocargli l&apos;accesso mantenendo lo storico.
        </AlertBanner>
      )}
      {errore && <AlertBanner variant="danger" role="alert">{errore}</AlertBanner>}
    </ConfirmDialog>
  );
}

// ── Dialog: password temporanea (mostrata una sola volta) ────────────────────
function DialogPassword({
  titolo,
  sottotitolo,
  password,
  onClose,
}: {
  titolo: string;
  sottotitolo: string;
  password: string;
  onClose: () => void;
}) {
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    try {
      await navigator.clipboard.writeText(password);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      setCopiato(false);
    }
  }

  return (
    <ConfirmDialog
      aperto
      onChiudi={onClose}
      titolo={titolo}
      sottotitolo={sottotitolo}
      azioni={<Button onClick={onClose}>Ho salvato la password</Button>}
    >
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
          Password temporanea
        </label>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 select-all break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900">
            {password}
          </code>
          <Button variant="secondary" onClick={copia}>
            {copiato ? "Copiato" : "Copia"}
          </Button>
        </div>
      </div>
      <AlertBanner variant="warning">
        Salva ora questa password: non sarà più visibile dopo la chiusura di questa finestra.
        Comunicala all&apos;utente tramite un canale sicuro.
      </AlertBanner>
    </ConfirmDialog>
  );
}
