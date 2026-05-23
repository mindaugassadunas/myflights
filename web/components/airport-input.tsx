"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type AirportPick = {
  id: string;
  icao: string | null;
  iata: string | null;
  name: string;
  municipality: string | null;
  isoCountry: string | null;
};

type Props = {
  label: string;
  placeholder?: string;
  value: AirportPick | null;
  onChange: (next: AirportPick | null) => void;
  autoFocus?: boolean;
};

/**
 * Mobile-first airport picker. Renders an inline result list below the input
 * (not a dropdown popover) so it works inside scrollable Vaul sheets without
 * z-index gymnastics.
 */
export function AirportInput({ label, placeholder, value, onChange, autoFocus }: Props) {
  const [query, setQuery] = React.useState(value ? formatChip(value) : "");
  const [results, setResults] = React.useState<AirportPick[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [focused, setFocused] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const resultsRef = React.useRef<HTMLUListElement | null>(null);
  const blurTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (focused) return;
    setQuery(value ? formatChip(value) : "");
  }, [focused, value]);

  // Debounced fetch.
  React.useEffect(() => {
    if (!focused) return;
    if (value && query === formatChip(value)) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/airports/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { results: AirportPick[] };
        if (!cancelled) setResults(data.results);
      } catch {
        // aborted / network — ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, focused, value]);

  const resultsOpen = focused && (loading || results.length > 0);

  React.useEffect(() => {
    if (!resultsOpen) return;

    const keepResultsVisible = () => {
      const root = rootRef.current;
      const target = resultsRef.current ?? root;
      if (!root || !target) return;

      const viewport = window.visualViewport;
      const visibleTop = viewport?.offsetTop ?? 0;
      const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
      const buffer = 16;
      const rect = target.getBoundingClientRect();

      let delta = 0;
      if (rect.bottom > visibleBottom - buffer) {
        delta = rect.bottom - (visibleBottom - buffer);
      } else if (rect.top < visibleTop + buffer) {
        delta = rect.top - (visibleTop + buffer);
      }
      if (delta === 0) return;

      const scroller = findScrollableParent(root);
      if (scroller instanceof Window) {
        scroller.scrollBy({ top: delta, behavior: "smooth" });
      } else {
        scroller.scrollBy({ top: delta, behavior: "smooth" });
      }
    };

    const frame = window.requestAnimationFrame(keepResultsVisible);
    const settle = window.setTimeout(keepResultsVisible, 320);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [resultsOpen, loading, results.length]);

  const pick = (a: AirportPick) => {
    onChange(a);
    setQuery(formatChip(a));
    setResults([]);
    inputRef.current?.blur();
  };

  return (
    <div ref={rootRef}>
      <label className="block text-[12px] font-mono-data uppercase tracking-wider text-text-secondary mb-1.5">
        {label}
      </label>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null); // user is editing — clear the prior pick
        }}
        onFocus={() => {
          if (blurTimeoutRef.current !== null) {
            window.clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = null;
          }
          setFocused(true);
        }}
        onBlur={() => {
          // Delay blur long enough for a tap on an inline result to land.
          blurTimeoutRef.current = window.setTimeout(() => {
            setFocused(false);
            blurTimeoutRef.current = null;
          }, 120);
        }}
        placeholder={placeholder ?? "VNO, Vilnius, Kaunas…"}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "w-full h-12 px-3 rounded-[8px]",
          "bg-surface border border-border",
          "text-[16px] font-mono-data",
          "focus:outline-none focus:border-accent",
        )}
      />
      {focused && (loading || results.length > 0) && (
        <ul
          ref={resultsRef}
          className="mt-2 border border-border rounded-[8px] bg-surface divide-y divide-border overflow-y-auto"
          style={{ maxHeight: "min(18rem, 36dvh)" }}
        >
          {loading && (
            <li className="px-3 py-2 text-[13px] text-text-secondary">searching…</li>
          )}
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(a)}
                className="w-full text-left px-3 py-2.5 active:bg-surface-elevated"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono-data text-[14px] text-accent">
                    {a.iata ?? a.icao}
                  </span>
                  <span className="text-[14px] truncate">{a.name}</span>
                </div>
                <div className="text-[12px] text-text-secondary">
                  {[a.municipality, a.isoCountry].filter(Boolean).join(" · ")}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatChip(a: AirportPick) {
  return a.iata ?? a.icao ?? a.name;
}

function findScrollableParent(node: HTMLElement): HTMLElement | Window {
  let current = node.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScroll = /(auto|scroll)/.test(style.overflowY);
    if (canScroll && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return window;
}
