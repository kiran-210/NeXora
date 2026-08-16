import { ReactNode } from "react";

export function ChartCard({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border bg-[var(--card)] p-5 shadow-card ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--text-dim)]">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-[var(--border-strong)] text-center">
      <p className="max-w-xs px-6 text-sm text-[var(--text-dim)]">{message}</p>
    </div>
  );
}
