"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_BASE = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clienti", label: "Clienti" },
  { href: "/visite", label: "Visite" },
  { href: "/pianificazione", label: "Pianificazione" },
];
// L'area /organizzazione è admin-only: il link compare solo per gli admin (il
// layout server-side reindirizza comunque i non-admin che digitano l'URL).
const NAV_ADMIN = [{ href: "/organizzazione", label: "Organizzazione" }];

interface Props {
  nome: string;
  ruolo: string;
  orgNome?: string | null;
  logoutAction: () => void | Promise<void>;
  children: React.ReactNode;
}

export default function DashboardShell({
  nome,
  ruolo,
  orgNome,
  logoutAction,
  children,
}: Props) {
  const [aperto, setAperto] = useState(false);
  const pathname = usePathname();

  // Sottotitolo brand = organizzazione corrente (Sprint 19.D); fallback alla
  // vecchia tagline se l'org non è ancora seedata.
  const sottotitolo = orgNome?.trim() || "Sicurezza sul lavoro";

  const nav = ruolo === "admin" ? [...NAV_BASE, ...NAV_ADMIN] : NAV_BASE;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const navLinks = (onClick?: () => void) =>
    nav.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClick}
        className={cn(
          "rounded-md px-3 py-2.5 text-sm font-medium transition",
          isActive(item.href)
            ? "bg-white/15 text-white"
            : "text-white/85 hover:bg-white/10 hover:text-white"
        )}
      >
        {item.label}
      </Link>
    ));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-brand text-white sm:flex">
        <div className="px-5 py-5">
          <span className="text-xl font-bold tracking-tight">SafeCheck</span>
          <p className="mt-0.5 truncate text-[11px] text-white/60">{sottotitolo}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">{navLinks()}</nav>
        <UserBox nome={nome} ruolo={ruolo} logoutAction={logoutAction} />
      </aside>

      {/* Top bar mobile — altezza fissa 4rem (h-16) così le intestazioni sticky
          delle pagine possono ancorarsi sotto la barra con `top-16` (fix bug #1
          checklist: prima l'header checklist finiva SOTTO questa barra). */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-brand px-4 text-white sm:hidden">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-lg font-bold tracking-tight">SafeCheck</span>
          <span className="truncate text-[10px] text-white/60">{sottotitolo}</span>
        </div>
        <button
          type="button"
          onClick={() => setAperto(true)}
          aria-label="Apri menu"
          className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-white/10"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {/* Drawer mobile */}
      {aperto && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAperto(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-brand text-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-xl font-bold tracking-tight">SafeCheck</span>
                <span className="mt-0.5 truncate text-[11px] text-white/60">{sottotitolo}</span>
              </div>
              <button
                type="button"
                onClick={() => setAperto(false)}
                aria-label="Chiudi menu"
                className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-white/10"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-3">
              {navLinks(() => setAperto(false))}
            </nav>
            <UserBox nome={nome} ruolo={ruolo} logoutAction={logoutAction} />
          </div>
        </div>
      )}

      {/* Contenuto */}
      <main className="p-4 sm:ml-60 sm:p-8">{children}</main>
    </div>
  );
}

function UserBox({
  nome,
  ruolo,
  logoutAction,
}: {
  nome: string;
  ruolo: string;
  logoutAction: () => void | Promise<void>;
}) {
  return (
    <div className="border-t border-white/10 px-4 py-4">
      <p className="truncate text-sm font-medium">{nome}</p>
      <p className="mb-3 text-[11px] uppercase tracking-wide text-white/55">
        {ruolo}
      </p>
      <Link
        href="/profilo"
        className="mb-2 block rounded-md px-3 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
      >
        Il mio profilo
      </Link>
      <form action={logoutAction}>
        <button
          type="submit"
          className="min-h-[44px] w-full rounded-md border border-white/20 px-3 text-sm font-medium text-white/90 transition hover:bg-white/10"
        >
          Logout
        </button>
      </form>
    </div>
  );
}
