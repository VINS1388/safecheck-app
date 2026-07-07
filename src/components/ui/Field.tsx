import { cn } from "@/lib/utils";

// Primitive di form (Sprint 16.5 · S2). Il vecchio `inputCls` era duplicato
// verbatim in ≥4 file, con un secondo stile concorrente (rounded-md vs
// rounded-lg, con/senza min-height). Qui una base sola.
//
// Accessibilità incorporata (requisito Vincenzo): min-h-[44px] DEFAULT su tutti
// i controlli + `text-base` (16px) per evitare lo zoom iOS al focus in modo
// nativo, senza dipendere dall'override globale `!important`.

const CONTROL_BASE =
  "w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 " +
  "placeholder:text-gray-400 transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand " +
  "disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500";

const CONTROL_INVALID = "border-red-300 focus:border-red-400 focus:ring-red-400";

/** Classi condivise dei controlli (per casi che non usano i wrapper). */
export function controlClasses(invalid?: boolean, className?: string) {
  return cn(CONTROL_BASE, "min-h-[44px]", invalid && CONTROL_INVALID, className);
}

// ── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}
export function Input({ invalid, className, ...rest }: InputProps) {
  return <input className={controlClasses(invalid, className)} {...rest} />;
}

// ── Textarea (min-h ≥ 44px, default 2 righe) ─────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        CONTROL_BASE,
        "min-h-[88px] py-2.5",
        invalid && CONTROL_INVALID,
        className
      )}
      {...rest}
    />
  );
}

// ── Select (nativo) ──────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select className={controlClasses(invalid, className)} {...rest}>
      {children}
    </select>
  );
}

// ── Field: wrapper etichetta + descrizione + errore ──────────────────────────
interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  descrizione?: string;
  errore?: string;
  className?: string;
  children: React.ReactNode;
}
export function Field({
  label,
  htmlFor,
  required,
  descrizione,
  errore,
  className,
  children,
}: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {descrizione && <p className="mt-0.5 text-xs text-gray-500">{descrizione}</p>}
      <div className="mt-1">{children}</div>
      {errore && <p className="mt-1 text-xs text-red-600">{errore}</p>}
    </div>
  );
}

export default Field;
