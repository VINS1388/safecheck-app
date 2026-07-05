"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import {
  creaUtenteAction,
  cambiaRuoloAction,
  impostaAttivoAction,
  resetPasswordAction,
} from "./actions";
import type { RuoloUtente, UtenteLista } from "@/lib/server/organizzazione";

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
  | { type: "ruolo"; utente: UtenteLista }
  | { type: "reset"; utente: UtenteLista }
  | { type: "stato"; utente: UtenteLista }
  | null;

type PasswordReveal = { titolo: string; sottotitolo: string; password: string } | null;

export default function OrganizzazioneClient({
  utenti,
  riepilogo,
}: {
  utenti: UtenteLista[];
  riepilogo: Riepilogo;
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

      {/* Sezione organizzazione (concettuale, Fase 3-ready) */}
      <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-[#1e3a5f] to-[#2c5480] p-5 text-white">
        <p className="text-[11px] uppercase tracking-wide text-white/60">Organizzazione corrente</p>
        <p className="mt-0.5 text-lg font-semibold">Studio Bilello</p>
        <p className="mt-1 text-sm text-white/70">
          Tutti gli utenti condividono questo spazio di lavoro. La gestione per più organizzazioni
          arriverà in una fase successiva.
        </p>
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
                        onRuolo={() => setModal({ type: "ruolo", utente: u })}
                        onReset={() => setModal({ type: "reset", utente: u })}
                        onStato={() => setModal({ type: "stato", utente: u })}
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
                    onRuolo={() => setModal({ type: "ruolo", utente: u })}
                    onReset={() => setModal({ type: "reset", utente: u })}
                    onStato={() => setModal({ type: "stato", utente: u })}
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
  onRuolo,
  onReset,
  onStato,
}: {
  utente: UtenteLista;
  isLastAdmin: boolean;
  onRuolo: () => void;
  onReset: () => void;
  onStato: () => void;
}) {
  const azioneStatoBloccata = utente.attivo && isLastAdmin; // disattivare l'ultimo admin
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
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
