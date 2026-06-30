"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// useLayoutEffect lato client, useEffect lato server (evita warning SSR).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  value: string;
  minRows?: number;
  maxRows?: number;
};

/**
 * Textarea con auto-resize: cresce con il contenuto da `minRows` fino a
 * `maxRows`, oltre il quale compare lo scroll interno. Tecnica JS robusta
 * (height='auto' → scrollHeight), compatibile con iOS Safari.
 */
export default function AutoResizeTextarea({
  value,
  minRows = 3,
  maxRows = 12,
  className,
  onChange,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = window.getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const padding =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) || 0;
    const border =
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) || 0;
    const maxH = lineHeight * maxRows + padding + border;
    const next = Math.min(el.scrollHeight, maxH);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  };

  // Ridimensiona al mount e a ogni cambio di valore (controllato).
  useIsoLayoutEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, maxRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      className={cn("resize-none", className)}
      {...rest}
    />
  );
}
