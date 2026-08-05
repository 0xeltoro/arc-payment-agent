import { ARCSCAN_URL, VAULT_ADDRESS } from "@/lib/config";

export default function Header() {
  return (
    <header className="flex flex-col gap-1 border-b border-zinc-800 pb-6 sm:flex-row sm:items-baseline sm:justify-between">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
        Arc Payment Agent
      </h1>
      <a
        href={`${ARCSCAN_URL}/address/${VAULT_ADDRESS}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm text-zinc-400 transition-colors hover:text-emerald-400"
      >
        {VAULT_ADDRESS}
      </a>
    </header>
  );
}
