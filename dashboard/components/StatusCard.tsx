export default function StatusCard({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-2 break-words text-base text-zinc-100 sm:text-lg ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
