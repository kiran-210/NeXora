import { EXPLORER_TX } from "@/lib/config";
import type { TxStatus } from "@/lib/useTx";

export function TxFeedback({
  status,
  error,
  hash,
}: {
  status: TxStatus;
  error: string | null;
  hash: string | null;
}) {
  if (status === "idle") return null;
  if (status === "pending")
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-[var(--text-dim)]">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Submitting transaction…
      </p>
    );
  if (status === "error")
    return <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>;
  if (status === "unconfirmed")
    return (
      <p className="mt-3 text-sm text-[var(--warn)]">
        {error}{" "}
        {hash && (
          <a
            href={EXPLORER_TX(hash)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            track transaction
          </a>
        )}
      </p>
    );
  return (
    <p className="mt-3 text-sm text-[var(--accent)]">
      Success ·{" "}
      {hash && (
        <a
          href={EXPLORER_TX(hash)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:opacity-80"
        >
          view transaction
        </a>
      )}
    </p>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 rounded-xl border bg-[var(--bg-elev)] p-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
            active === t
              ? "bg-[var(--card-hover)] text-[var(--text)]"
              : "text-[var(--text-dim)] hover:text-[var(--text)]"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
