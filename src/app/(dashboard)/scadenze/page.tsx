import { redirect } from "next/navigation";

/**
 * Sprint 18.1 — la superficie /scadenze è stata rimossa dalla navigazione di
 * prodotto (registro di date ancora non maturo lato UX). La route resta come
 * redirect pulito verso la dashboard, così eventuali link/bookmark esistenti
 * non danno 404. Il motore scadenze (tabella, RPC materializza_scadenze, writer
 * in genera-pdf) resta invariato lato backend: solo la superficie UI è rimossa.
 */
export default function ScadenzePage() {
  redirect("/dashboard");
}
