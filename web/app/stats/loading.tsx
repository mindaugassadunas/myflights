export default function Loading() {
  return (
    <div
      className="pt-[calc(env(safe-area-inset-top)+16px)] pb-12"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Hero */}
      <header className="px-5 mb-10">
        <div className="flex items-center gap-3">
          <div className="h-3 w-16 rounded-[2px] bg-surface animate-pulse" />
          <span className="h-px flex-1 bg-border" />
          <div className="h-3 w-20 rounded-[2px] bg-surface animate-pulse" />
        </div>
        <div className="mt-6 h-16 w-64 rounded-[2px] bg-surface animate-pulse" />
        <div className="mt-3 h-4 w-40 rounded-[2px] bg-surface animate-pulse" />
      </header>

      {/* Ribbon */}
      <section className="px-5 mb-12">
        <div className="border-y border-border divide-x divide-border grid grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-3 py-4 animate-pulse">
              <div className="h-3 w-20 rounded-[2px] bg-surface" />
              <div className="mt-2 h-7 w-16 rounded-[2px] bg-surface" />
            </div>
          ))}
        </div>
      </section>

      {/* Sections */}
      {Array.from({ length: 3 }).map((_, s) => (
        <section key={s} className="px-5 mb-14">
          <div className="flex items-start gap-4 pb-3 border-b border-accent/30">
            <div className="h-10 w-10 rounded-[2px] bg-surface animate-pulse" />
            <div className="flex-1 pt-1">
              <div className="h-6 w-36 rounded-[2px] bg-surface animate-pulse" />
              <div className="mt-2 h-3 w-48 rounded-[2px] bg-surface animate-pulse" />
            </div>
          </div>
          <ul className="mt-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <li
                key={i}
                className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-4 border-b border-border last:border-b-0 animate-pulse"
              >
                <div className="min-w-0">
                  <div className="h-3 w-24 rounded-[2px] bg-surface" />
                  <div className="mt-2 h-5 w-40 rounded-[2px] bg-surface" />
                </div>
                <div className="h-6 w-16 rounded-[2px] bg-surface" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
