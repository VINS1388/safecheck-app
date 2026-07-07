import { cn } from "@/lib/utils";

// Primitiva Button del design system (Sprint 16.5 · S2).
// Varianti coerenti + accessibilità mobile-first incorporata: min-h-[44px] è il
// DEFAULT della primitiva (non un'opzione da ricordare pagina per pagina), a
// chiusura dei touch target incoerenti (26–48px) rilevati nello STEP 0.
//
// Due forme d'uso:
//   <Button variant="primary">…</Button>                 → elemento <button>
//   <Link className={buttonClasses("secondary")}>…</Link> → link stilizzato come bottone
// (l'app usa entrambi: azioni-azione e Link-che-sembrano-bottoni.)

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTI: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  ghost: "text-brand hover:bg-brand/5",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

// min-h ≥ 44px in ogni size — è il pavimento accessibile della primitiva.
const SIZE: Record<ButtonSize, string> = {
  md: "min-h-[44px] px-4",
  lg: "min-h-[48px] px-5",
};

/** Stringa di classi del bottone — per stilizzare un <Link> o un elemento non-button. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string
) {
  return cn(BASE, VARIANTI[variant], SIZE[size], className);
}

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size), fullWidth && "w-full", className)}
      {...rest}
    />
  );
}
