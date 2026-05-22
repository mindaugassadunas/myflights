export default function Loading() {
  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)] pb-10" aria-busy="true" aria-live="polite">
      <header className="px-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="h-7 w-44 rounded-[2px] bg-surface animate-pulse" />
          <div className="h-6 w-16 rounded-[4px] bg-surface animate-pulse" />
        </div>
        <div className="mt-2 h-[18px] w-56 rounded-[2px] bg-surface animate-pulse" />
        <div className="mt-1 h-[18px] w-64 rounded-[2px] bg-surface animate-pulse" />
      </header>

      <section className="mt-6 mx-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-border rounded-[2px] p-3 animate-pulse"
          >
            <div className="h-3 w-20 rounded-[2px] bg-surface-elevated" />
            <div className="mt-2 h-5 w-24 rounded-[2px] bg-surface-elevated" />
          </div>
        ))}
      </section>

      <section className="mt-6 mx-5 relative h-72 border border-border rounded-[2px] overflow-hidden bg-surface animate-pulse" />
      <section className="mt-4 mx-5 relative h-56 border border-border rounded-[2px] overflow-hidden bg-surface animate-pulse" />
    </div>
  );
}
