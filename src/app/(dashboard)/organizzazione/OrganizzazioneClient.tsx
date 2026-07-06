"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
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
import type { RuoloUtente, UtenteLista } from "@/lib/server/organizzazione";
import type { ProfiloOrganizzazione } from "@/lib/server/org-profilo";

// ── Costanti presentazione ───────────────────────────────────────────────────
const RUOLO_LABEL: Record<RuoloUtente, string> = {
  admin: "Amministratore",
  planner: "Pianificatore",
  specialist: "Tecnico",
};
const RUOLO_BADGE: Record<RuoloUtente, string> = {
  admin: "bg-purple-100 text-purple-700",
  planner: "bg-blue-100 text-blue-700",
  specialist: "bg-teal-100 text-teal-700",
};
const RUOLI: RuoloUtente[] = ["admin", "planner", "specialist"];

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";
const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304e] disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50";
const LOCKOUT_MSG =
  "Non puoi disattivare o retrocedere l'unico admin attivo dell'organizzazione";

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
  utenti: UtenteLista[];
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizzazione</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestisci utenti, ruoli e accessi alla piattaforma
          </p>
        </div>
        <button type="button" className={`${btnPrimary} w-full sm:w-auto`} onClick={() => setModal({ type: "aggiungi" })}>
          + Aggiungi utente
        </button>
      </div>

      {/* Profilo Organizzazione (dati reali, migration 031). Lettura: tutti;
          scrittura: admin — qui siamo in area admin-only, quindi editabile. */}
      <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-[#1e3a5f] to-[#2c5480] p-5 text-white">
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
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome o email…"
          className={`${inputCls} mt-0 sm:max-w-xs`}
        />
        <div className="flex gap-3">
          <select
            value={filtroRuolo}
            onChange={(e) => setFiltroRuolo(e.target.value as "tutti" | RuoloUtente)}
            className={`${inputCls} mt-0`}
            aria-label="Filtra per ruolo"
          >
            <option value="tutti">Tutti i ruoli</option>
            {RUOLI.map((r) => (
              <option key={r} value={r}>
                {RUOLO_LABEL[r]}
              </option>
            ))}
          </select>
          <select
            value={filtroStato}
            onChange={(e) => setFiltroStato(e.target.value as "tutti" | "attivi" | "disattivati")}
            className={`${inputCls} mt-0`}
            aria-label="Filtra per stato"
          >
            <option value="tutti">Tutti gli stati</option>
            <option value="attivi">Solo attivi</option>
            <option value="disattivati">Solo disattivati</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      {filtrati.length === 0 ? (
        <EmptyState
          titolo="Nessun utente trovato"
          descrizione={
            utenti.length === 0
              ? "Aggiungi il primo utente dell'organizzazione."
              : "Nessun utente corrisponde ai filtri selezionati."
          }
        />
      ) : (
        <>
          {/* Desktop: tabella */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Utente</th>
                  <th className="px-4 py-3 font-medium">Ruolo</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 font-medium">Creato</th>
                  <th className="px-4 py-3 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrati.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{u.nome_completo}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RuoloBadge ruolo={u.ruolo} />
                    </td>
                    <td className="px-4 py-3">
                      <StatoBadgeUtente attivo={u.attivo} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formattaData(u.creato_il)}</td>
                    <td className="px-4 py-3">
                      <RigaAzioni
                        utente={u}
                        isLastAdmin={u.id === lastActiveAdminId}
                        onModifica={() => setModal({ type: "anagrafica", utente: u })}
                        onRuolo={() => setModal({ type: "ruolo", utente: u })}
                        onReset={() => setModal({ type: "reset", utente: u })}
                        onStato={() => setModal({ type: "stato", utente: u })}
                        onElimina={() => setModal({ type: "elimina", utente: u })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card */}
          <div className="space-y-3 sm:hidden">
            {filtrati.map((u) => (
              <div key={u.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{u.nome_completo}</p>
                    <p className="truncate text-xs text-gray-500">{u.email}</p>
                  </div>
                  <StatoBadgeUtente attivo={u.attivo} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <RuoloBadge ruolo={u.ruolo} />
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
            ))}
          </div>
        </>
      )}

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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-2xl font-bold text-gray-900">{valore}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function RuoloBadge({ ruolo }: { ruolo: RuoloUtente }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${RUOLO_BADGE[ruolo]}`}
    >
      {RUOLO_LABEL[ruolo]}
    </span>
  );
}

function StatoBadgeUtente({ attivo }: { attivo: boolean }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        attivo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {attivo ? "Attivo" : "Disattivato"}
    </span>
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
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onModifica}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#1e3a5f] hover:bg-[#1e3a5f]/10"
      >
        Modifica
      </button>
      <button
        type="button"
        onClick={onRuolo}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#1e3a5f] hover:bg-[#1e3a5f]/10"
      >
        Ruolo
      </button>
      <button
        type="button"
        onClick={onReset}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#1e3a5f] hover:bg-[#1e3a5f]/10"
      >
        Reset password
      </button>
      {utente.attivo ? (
        <button
          type="button"
          onClick={onStato}
          disabled={azioneStatoBloccata}
          title={azioneStatoBloccata ? LOCKOUT_MSG : undefined}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          Disattiva
        </button>
      ) : (
        <button
          type="button"
          onClick={onStato}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
        >
          Riattiva
        </button>
      )}
      <button
        type="button"
        onClick={onElimina}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Elimina
      </button>
    </div>
  );
}

// ── Modal base ───────────────────────────────────────────────────────────────
function Modal({
  titolo,
  sottotitolo,
  onClose,
  children,
}: {
  titolo: string;
  sottotitolo?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <h2 className="text-lg font-semibold text-gray-900">{titolo}</h2>
        {sottotitolo && <p className="mt-0.5 text-sm text-gray-500">{sottotitolo}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ErroreBox({ messaggio }: { messaggio: string }) {
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{messaggio}</p>
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
    <Modal titolo="Aggiungi utente" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nome completo <span className="text-red-500">*</span>
          </label>
          <input
            className={inputCls}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Mario Rossi"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="mario.rossi@studio.it"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Ruolo</label>
          <select
            className={inputCls}
            value={ruolo}
            onChange={(e) => setRuolo(e.target.value as RuoloUtente)}
          >
            {RUOLI.map((r) => (
              <option key={r} value={r}>
                {RUOLO_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {errore && <ErroreBox messaggio={errore} />}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Creazione…" : "Crea utente"}
          </button>
        </div>
      </form>
    </Modal>
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
    <Modal titolo="Profilo organizzazione" sottotitolo="Dati dello studio, visibili a tutti gli utenti" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Ragione sociale <span className="text-red-500">*</span>
          </label>
          <input className={inputCls} value={f.ragione_sociale} onChange={set("ragione_sociale")} required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Partita IVA</label>
            <input className={inputCls} value={f.partita_iva} onChange={set("partita_iva")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Codice fiscale</label>
            <input className={inputCls} value={f.codice_fiscale} onChange={set("codice_fiscale")} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Indirizzo</label>
          <input className={inputCls} value={f.indirizzo} onChange={set("indirizzo")} />
        </div>
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-3">
            <label className="block text-sm font-medium text-gray-700">Città</label>
            <input className={inputCls} value={f.citta} onChange={set("citta")} />
          </div>
          <div className="col-span-1">
            <label className="block text-sm font-medium text-gray-700">CAP</label>
            <input className={inputCls} value={f.cap} onChange={set("cap")} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Provincia</label>
            <input className={`${inputCls} uppercase`} maxLength={2} value={f.provincia} onChange={set("provincia")} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input className={inputCls} type="email" value={f.email} onChange={set("email")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Telefono</label>
            <input className={inputCls} value={f.telefono} onChange={set("telefono")} />
          </div>
        </div>
        {errore && <ErroreBox messaggio={errore} />}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </form>
    </Modal>
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
    <Modal titolo="Modifica dati utente" sottotitolo={utente.email} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nome completo <span className="text-red-500">*</span>
          </label>
          <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Telefono</label>
            <input className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Qualifica</label>
            <input className={inputCls} value={qualifica} onChange={(e) => setQualifica(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Ruolo, stato ed email non si modificano da qui (email non è modificabile).
        </p>
        {errore && <ErroreBox messaggio={errore} />}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </form>
    </Modal>
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
    <Modal titolo="Modifica ruolo" sottotitolo={`${utente.nome_completo} · ${utente.email}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Nuovo ruolo</label>
          <select
            className={inputCls}
            value={ruolo}
            onChange={(e) => setRuolo(e.target.value as RuoloUtente)}
          >
            {RUOLI.map((r) => (
              <option key={r} value={r}>
                {RUOLO_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {!invariato && !retrocessioneVietata && (
          <p className="text-sm text-gray-600">
            Stai modificando il ruolo di <strong>{utente.nome_completo}</strong> da{" "}
            {RUOLO_LABEL[utente.ruolo]} a {RUOLO_LABEL[ruolo]}. Confermi?
          </p>
        )}
        {retrocessioneVietata && <ErroreBox messaggio={LOCKOUT_MSG} />}
        {errore && <ErroreBox messaggio={errore} />}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={conferma}
            disabled={busy || invariato || retrocessioneVietata}
          >
            {busy ? "Salvataggio…" : "Conferma"}
          </button>
        </div>
      </div>
    </Modal>
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
    <Modal titolo="Reset password" sottotitolo={`${utente.nome_completo} · ${utente.email}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Verrà generata una nuova password temporanea per{" "}
          <strong>{utente.nome_completo}</strong>. La password attuale smetterà di funzionare
          immediatamente. Confermi?
        </p>
        {errore && <ErroreBox messaggio={errore} />}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button type="button" className={btnPrimary} onClick={conferma} disabled={busy}>
            {busy ? "Generazione…" : "Reimposta password"}
          </button>
        </div>
      </div>
    </Modal>
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
    <Modal
      titolo={disattiva ? "Disattiva utente" : "Riattiva utente"}
      sottotitolo={`${utente.nome_completo} · ${utente.email}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
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
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {slotImpattati === 1
              ? "1 slot di pianificazione futuro è assegnato a questo tecnico. Resterà assegnato a lui, segnalato come «Tecnico disattivato» nella pianificazione, finché non lo riassegni manualmente. La disattivazione non lo rimuove."
              : `${slotImpattati} slot di pianificazione futuri sono assegnati a questo tecnico. Resteranno assegnati a lui, segnalati come «Tecnico disattivato» nella pianificazione, finché non li riassegni manualmente. La disattivazione non li rimuove.`}
          </p>
        )}
        {errore && <ErroreBox messaggio={errore} />}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button
            type="button"
            className={
              disattiva
                ? "inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                : btnPrimary
            }
            onClick={conferma}
            disabled={busy}
          >
            {busy ? "Attendere…" : disattiva ? "Disattiva" : "Riattiva"}
          </button>
        </div>
      </div>
    </Modal>
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
    <Modal titolo="Elimina definitivamente" sottotitolo={`${utente.nome_completo} · ${utente.email}`} onClose={onClose}>
      <div className="space-y-4">
        {caricando ? (
          <p className="text-sm text-gray-500">Verifica dei dati collegati…</p>
        ) : dip?.eliminabile ? (
          <p className="text-sm text-gray-600">
            L&apos;utente non ha dati collegati. L&apos;eliminazione è definitiva e{" "}
            <strong>non reversibile</strong>. Per un utente con storico usa invece la disattivazione.
          </p>
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Non eliminabile: l&apos;utente ha {blocchi.join(", ")}. Usa la disattivazione per
            revocargli l&apos;accesso mantenendo lo storico.
          </p>
        )}
        {errore && <ErroreBox messaggio={errore} />}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            onClick={conferma}
            disabled={busy || caricando || !dip?.eliminabile}
          >
            {busy ? "Eliminazione…" : "Elimina definitivamente"}
          </button>
        </div>
      </div>
    </Modal>
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
    <Modal titolo={titolo} sottotitolo={sottotitolo} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Password temporanea
          </label>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900">
              {password}
            </code>
            <button type="button" className={btnSecondary} onClick={copia}>
              {copiato ? "Copiato" : "Copia"}
            </button>
          </div>
        </div>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Salva ora questa password: non sarà più visibile dopo la chiusura di questa finestra.
          Comunicala all&apos;utente tramite un canale sicuro.
        </p>
        <div className="flex justify-end pt-1">
          <button type="button" className={btnPrimary} onClick={onClose}>
            Ho salvato la password
          </button>
        </div>
      </div>
    </Modal>
  );
}
