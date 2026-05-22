export default function Loading() {
  return (
    <div className="px-5 py-6 pt-[calc(env(safe-area-inset-top)+16px)]">
      <header>
        <h1 className="text-[22px] leading-7 font-light">Flight log</h1>
        <div className="mt-1 h-[18px] w-32 rounded-[2px] bg-surface animate-pulse" />
      </header>

      <ul className="mt-6 space-y-3" aria-busy="true" aria-live="polite">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i}>
            <SkeletonCard />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-[2px] px-5 py-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="h-6 w-32 rounded-[2px] bg-surface-elevated" />
          <div className="mt-2 h-[18px] w-40 rounded-[2px] bg-surface-elevated" />
        </div>
        <div className="h-6 w-16 rounded-[4px] bg-surface-elevated" />
      </div>
      <div className="mt-3 h-[17px] w-48 rounded-[2px] bg-surface-elevated" />
    </div>
  );
}
