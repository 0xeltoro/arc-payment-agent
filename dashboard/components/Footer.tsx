import { GITHUB_REPO_URL } from "@/lib/config";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 pt-6 text-sm text-zinc-500">
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-emerald-400"
      >
        View source on GitHub
      </a>
    </footer>
  );
}
