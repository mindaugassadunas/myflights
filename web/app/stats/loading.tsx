export default function Loading() {
  return (
    <div
      className="px-5 py-6 pt-[calc(env(safe-area-inset-top)+16px)] space-y-5 pb-10"
      aria-busy="true"
      aria-live="polite"
    >
      <header>
        <h1 className="text-[22px] leading-7 font-light">Lifetime</h1>
        <div className="mt-1 h-[18px] w-56 rounded-[2px] bg-surface animate-pulse" />
      </header>

      <section className="bg-surface border border-border rounded-[2px] p-5 animate-pulse">
        <div className="h-3 w-24 rounded-[2px] bg-surface-elevated" />
        <div className="mt-3 h-10 w-48 rounded-[2px] bg-surface-elevated" />
        <div className="mt-2 h-[14px] w-40 rounded-[2px] bg-surface-elevated" />
      </section>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-border rounded-[2px] p-4 animate-pulse"
          >
            <div className="h-3 w-16 rounded-[2px] bg-surface-elevated" />
            <div className="mt-3 h-7 w-20 rounded-[2px] bg-surface-elevated" />
          </div>
        ))}
      </div>

      <section>
        <div className="h-[14px] w-28 rounded-[2px] bg-surface animate-pulse mb-3" />
        <div className="bg-surface border border-border rounded-[2px] p-3 animate-pulse">
          <div className="flex gap-4 mb-3">
            <div className="h-3 w-16 rounded-[2px] bg-surface-elevated" />
            <div className="h-3 w-24 rounded-[2px] bg-surface-elevated" />
          </div>
          <div className="h-48 rounded-[2px] bg-surface-elevated" />
        </div>
      </section>

      <section>
        <div className="h-[14px] w-20 rounded-[2px] bg-surface animate-pulse mb-3" />
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center justify-between bg-surface border border-border rounded-[2px] px-4 py-3 animate-pulse"
            >
              <div className="flex-1">
                <div className="h-3 w-32 rounded-[2px] bg-surface-elevated" />
                <div className="mt-2 h-[18px] w-24 rounded-[2px] bg-surface-elevated" />
              </div>
              <div className="h-5 w-16 rounded-[2px] bg-surface-elevated" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
