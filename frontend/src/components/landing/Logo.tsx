import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] text-white shadow-[var(--shadow-blue)]">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden>
          <path
            d="M0,16 L0,0 L4,0 L12,12 L12,0 L16,0 L16,16 L12,16 L4,4 L4,16 Z"
            fill="currentColor"
            opacity="0.55"
            transform="translate(4,9)"
          />
          <path
            d="M0,16 L0,0 L4,0 L12,12 L12,0 L16,0 L16,16 L12,16 L4,4 L4,16 Z"
            fill="currentColor"
            transform="translate(12,7)"
          />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight text-[var(--text)]">NeXora</span>
    </Link>
  );
}
