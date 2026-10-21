/**
 * Small reusable component system (Tailwind). Kept intentionally simple so every
 * component can be explained in a few sentences during the project defense.
 */
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-300/60",
  secondary: "bg-navy-700 text-slate-100 hover:bg-navy-600 border border-navy-600 disabled:text-slate-500",
  danger: "bg-rose-700 text-white hover:bg-rose-600 disabled:bg-rose-950 disabled:text-rose-300/50",
  ghost: "text-slate-300 hover:bg-navy-800 hover:text-white disabled:text-slate-600",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variants[variant],
        className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5", label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <svg className={cx("animate-spin text-blue-400", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label ?? "Loading"}</span>
      {label && (
        <span className="text-sm text-slate-400" aria-hidden="true">
          {label}
        </span>
      )}
    </span>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-navy-700 bg-navy-900/80 shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-700 px-5 py-3">
          {title && <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";
const tones: Record<Tone, string> = {
  neutral: "bg-slate-700/40 text-slate-300 ring-slate-500/30",
  blue: "bg-blue-500/15 text-blue-300 ring-blue-400/30",
  green: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  red: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  violet: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = "blue",
  title,
  children,
}: {
  tone?: "blue" | "amber" | "red" | "green";
  title?: string;
  children?: ReactNode;
}) {
  const styles = {
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-100",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    red: "border-rose-500/40 bg-rose-500/10 text-rose-100",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  }[tone];
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", styles)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title && "mt-1", "text-sm opacity-90")}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-navy-600 px-6 py-10 text-center">
      <p className="font-medium text-slate-200">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-400">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-900/80 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

const inputBase =
  "w-full rounded-md border border-navy-600 bg-navy-850 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60";

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="text-xs text-rose-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, className)} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, "min-h-24", className)} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputBase, className)} />;
}

/** Monospace value (address / hash) with a copy button. */
export function Mono({ value, display }: { value: string; display?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300">
      <span title={value}>{display ?? value}</span>
      <button
        type="button"
        className="rounded px-1 text-slate-500 hover:text-slate-200"
        aria-label={`Copy ${value}`}
        onClick={() => void navigator.clipboard?.writeText(value)}
      >
        ⧉
      </button>
    </span>
  );
}

/** Accessible confirmation dialog (focus is moved into the dialog; Escape cancels). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="w-full max-w-md rounded-xl border border-navy-600 bg-navy-900 p-6 shadow-xl"
      >
        <h2 id={id} className="text-lg font-semibold text-white">
          {title}
        </h2>
        <div className="mt-3 text-sm text-slate-300">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export const th = "border-b border-navy-700 px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-400";
export const td = "border-b border-navy-800 px-3 py-2.5 align-top text-slate-200";
