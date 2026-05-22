"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function FlightDetailActions({
  flightId,
  canRetry,
}: {
  flightId: string;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = React.useState<"resolve" | "delete" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const resolve = async () => {
    setError(null);
    setWorking("resolve");
    try {
      const resp = await fetch(`/api/flights/${flightId}/resolve`, { method: "POST" });
      if (!resp.ok) {
        const payload = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `error ${resp.status}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const confirmDelete = async () => {
    setError(null);
    setWorking("delete");
    try {
      const resp = await fetch(`/api/flights/${flightId}`, { method: "DELETE" });
      if (!resp.ok) {
        const payload = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `error ${resp.status}`);
      }
      setConfirmOpen(false);
      router.replace("/log");
    } catch (err) {
      setError((err as Error).message);
      setWorking(null);
    }
  };

  return (
    <>
      <div className="mt-6 mx-5 flex gap-3">
        {canRetry && (
          <button
            type="button"
            onClick={resolve}
            disabled={working !== null}
            className="flex-1 h-11 rounded-[8px] border border-border text-text-primary active:bg-surface disabled:opacity-50"
          >
            {working === "resolve" ? "Retrying…" : "Retry resolve"}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setError(null); setConfirmOpen(true); }}
          disabled={working !== null}
          className="flex-1 h-11 rounded-[8px] border border-danger/40 text-danger active:bg-danger/10 disabled:opacity-50"
        >
          Delete flight
        </button>
      </div>
      {error && !confirmOpen && (
        <div className="mt-3 mx-5 text-[13px] text-warning">{error}</div>
      )}

      <Sheet
        open={confirmOpen}
        onOpenChange={(o) => {
          if (working === "delete") return;
          setConfirmOpen(o);
          if (!o) setError(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Delete this flight?</SheetTitle>
            <SheetDescription>
              This removes the logged flight along with its resolved ADS-B
              track and stats contribution. It can't be undone.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] space-y-3">
            {error && (
              <p className="text-[13px] text-warning">{error}</p>
            )}
            <button
              type="button"
              onClick={confirmDelete}
              disabled={working === "delete"}
              className="w-full h-12 rounded-[8px] bg-danger/15 border border-danger/40 text-danger font-medium active:bg-danger/25 disabled:opacity-60"
            >
              {working === "delete" ? "Deleting…" : "Delete flight"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={working === "delete"}
              className="w-full h-12 rounded-[8px] border border-border text-text-primary active:bg-surface disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
