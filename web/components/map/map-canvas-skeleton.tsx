/**
 * Dark map-shaped placeholder shown while the SSR query resolves or the
 * MapLibre client bundle downloads. Mirrors the Map tab's full-bleed
 * canvas so the eye has something to latch onto instead of a blank page.
 */
export function MapCanvasSkeleton() {
  return (
    <div className="fixed inset-0 bg-bg overflow-hidden" aria-busy="true" aria-live="polite">
      {/* Faint grid — evokes a graticule without rendering one for real. */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(to right, #1F2228 1px, transparent 1px), linear-gradient(to bottom, #1F2228 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      {/* Subtle radial wash so the centre reads as "loading" not "empty". */}
      <div
        className="absolute inset-0 animate-pulse"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,212,255,0.04) 0%, transparent 60%)",
        }}
      />
      <div className="absolute top-[calc(env(safe-area-inset-top)+16px)] right-4 flex flex-col gap-2">
        <div className="h-10 w-10 rounded-[8px] bg-surface border border-border animate-pulse" />
        <div className="h-10 w-10 rounded-[8px] bg-surface border border-border animate-pulse" />
      </div>
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+96px)] left-1/2 -translate-x-1/2 text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
        Loading map…
      </div>
    </div>
  );
}
