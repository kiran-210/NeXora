import { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border bg-[var(--card)] p-5 shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tnum ${
          accent ? "text-[var(--accent)]" : "text-[var(--text)]"
        }`}
      >
        {value}
      </div>
      {sub != null && <div className="mt-0.5 text-xs text-[var(--text-dim)] tnum">{sub}</div>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const styles = {
    primary:
      "bg-[var(--accent)] text-white shadow-[var(--shadow-blue)] hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:shadow-none",
    ghost:
      "bg-[var(--card)] border text-[var(--text)] hover:bg-[var(--card-hover)] disabled:opacity-40",
    danger: "bg-[var(--danger)] text-white hover:opacity-90 disabled:opacity-40",
  }[variant];
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const tones = {
    neutral: "bg-[var(--bg-elev)] text-[var(--text-dim)]",
    good: "bg-[var(--success-soft)] text-[var(--success)]",
    warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
    bad: "bg-[var(--danger-soft)] text-[var(--danger)]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tones}`}>
      {children}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--card-hover)] ${className}`} />;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-dim)]">
        <span>{label}</span>
        {hint}
      </div>
      {children}
    </label>
  );
}

export function AmountInput({
  value,
  onChange,
  placeholder = "0.00",
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center rounded-xl border bg-[var(--bg-elev)] px-3 focus-within:border-[var(--accent)]">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          // A second "." (easy to fat-finger, especially on a mobile numeric
          // keypad) used to survive here and parse to a silent 0 downstream —
          // the submit button just went disabled with no explanation. Collapse
          // extra dots instead of stripping to blank/zero.
          const cleaned = e.target.value.replace(/[^0-9.]/g, "");
          const [whole, ...rest] = cleaned.split(".");
          onChange(rest.length ? `${whole}.${rest.join("")}` : whole);
        }}
        placeholder={placeholder}
        className="w-full bg-transparent py-3 text-lg tnum outline-none placeholder:text-[var(--text-dim)]"
      />
      {suffix && <span className="pl-2 text-sm font-medium text-[var(--text-dim)]">{suffix}</span>}
    </div>
  );
}
