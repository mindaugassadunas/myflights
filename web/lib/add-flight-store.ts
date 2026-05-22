"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny singleton store driving the AddFlightSheet open/closed state.
 *
 * We *don't* drive open/closed from `useSearchParams` because the FAB used
 * to be a `<Link href="?add=1">`, which forced a Next.js soft-nav and
 * re-ran the current `force-dynamic` page's server query (~200-300ms) on
 * every tap. Now the FAB calls `openAddFlight()` which:
 *
 *   1. Flips this store's boolean (sheet animates open immediately)
 *   2. Mirrors the state to the URL via `history.replaceState` (so back
 *      closes the sheet and deep-linking via /add still works)
 *
 * Initial state is read from the URL on first subscribe, so a hard load
 * of `/log?add=1` still opens the sheet.
 */

const SUBS = new Set<() => void>();
let open = false;
let initialised = false;

function getSnapshot(): boolean {
  return open;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(listener: () => void): () => void {
  ensureInit();
  SUBS.add(listener);
  return () => SUBS.delete(listener);
}

function notify() {
  SUBS.forEach((cb) => cb());
}

function ensureInit() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  open = new URLSearchParams(window.location.search).get("add") === "1";

  // Browser back/forward → keep store in sync with URL so the sheet
  // closes when the user navigates back past the `?add=1` entry.
  window.addEventListener("popstate", () => {
    const next = new URLSearchParams(window.location.search).get("add") === "1";
    if (next !== open) {
      open = next;
      notify();
    }
  });
}

function syncUrl(next: boolean) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (next) {
    if (params.get("add") === "1") return;
    params.set("add", "1");
  } else {
    if (!params.has("add")) return;
    params.delete("add");
  }
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", url);
}

export function openAddFlight(): void {
  ensureInit();
  if (open) return;
  open = true;
  syncUrl(true);
  notify();
}

export function closeAddFlight(): void {
  ensureInit();
  if (!open) return;
  open = false;
  syncUrl(false);
  notify();
}

export function useAddFlightOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
