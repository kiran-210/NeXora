import { AppNav } from "@/components/app/AppNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <AppNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 sm:px-8">{children}</main>
      <footer className="border-t py-6 text-center text-xs text-[var(--text-dim)]">
        NeXora · Stellar Testnet · Prices by Reflector
      </footer>
    </div>
  );
}
