"use client";

import * as React from "react";
import Link from "next/link";
import { Drawer as VaulDrawer } from "vaul";
import { FlightStatusBadge } from "@/components/flight-status-badge";
import AltitudeChart from "@/components/altitude-chart-loader";
import type { ChartWaypoint } from "@/components/altitude-chart";
import { cn } from "@/lib/utils";

export type SelectedFlight = {
  flightId: string;
  callsign: string | null;
  dep: string | null;
  arr: string | null;
  date: string;
  status: "pending" | "resolved" | "no_coverage" | "ambiguous" | "failed";
};

type TrackResponse = {
  flight_id: string;
  icao24: string;
  point_count: number;
  distance_km: number;
  duration_min: number;
  waypoints: ChartWaypoint[];
  gaps: { start: number; end: number; duration_s: number }[];
};

const SNAP_HALF = "44%";
const SNAP_FULL = "94%";

/**
 * Map-page bottom sheet. At the half snap it shows route + status; drag up
 * to full to reveal distance, duration, point count, and the altitude/speed
 * chart (Plotly, lazy-loaded only when the user expands the sheet).
 *
 * `modal={false}` keeps the map interactive at half snap.
 */
export function FlightSheet({
  flight,
  onOpenChange,
}: {
  flight: SelectedFlight | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [snap, setSnap] = React.useState<number | string | null>(SNAP_HALF);

  React.useEffect(() => {
    if (flight) setSnap(SNAP_HALF);
  }, [flight]);

  const expanded = snap === SNAP_FULL;
  const open = flight !== null;

  return (
    <VaulDrawer.Root
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      snapPoints={[SNAP_HALF, SNAP_FULL]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <VaulDrawer.Portal>
        <VaulDrawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-40",
            "bg-surface-elevated border-t border-border rounded-t-[12px]",
            "outline-none",
            // Vaul controls height via the snap point; clamp inner content.
            "flex flex-col",
          )}
          style={{ height: "100dvh" }}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />

          {flight ? (
            <FlightSheetBody flight={flight} expanded={expanded} />
          ) : null}
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
}

function FlightSheetBody({
  flight,
  expanded,
}: {
  flight: SelectedFlight;
  expanded: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] min-h-0">
      <div className="flex items-baseline justify-between gap-3">
        <VaulDrawer.Title className="font-mono-data text-[22px] leading-7">
          {flight.dep ?? "—"}{" "}
          <span className="text-text-secondary">→</span>{" "}
          {flight.arr ?? "—"}
        </VaulDrawer.Title>
        <FlightStatusBadge status={flight.status} />
      </div>
      <VaulDrawer.Description className="mt-1 text-[14px] text-text-secondary">
        {flight.callsign ?? "—"} · {flight.date}
      </VaulDrawer.Description>

      {expanded ? (
        <ExpandedDetail flightId={flight.flightId} />
      ) : (
        <div className="mt-4 text-[13px] text-text-secondary">
          Drag up for altitude profile, distance & gaps.
        </div>
      )}

      <div className="mt-auto pt-3">
        <Link
          href={`/flights/${flight.flightId}`}
          className="block h-12 rounded-[8px] bg-accent text-bg font-medium flex items-center justify-center"
        >
          Open flight
        </Link>
      </div>
    </div>
  );
}

function ExpandedDetail({ flightId }: { flightId: string }) {
  const [track, setTrack] = React.useState<TrackResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setTrack(null);
    setError(null);
    (async () => {
      try {
        const resp = await fetch(`/api/flights/${flightId}/track`, {
          signal: controller.signal,
        });
        if (!resp.ok) {
          const payload = (await resp.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `error ${resp.status}`);
        }
        const data = (await resp.json()) as TrackResponse;
        if (!cancelled) setTrack(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [flightId]);

  return (
    <div className="mt-4 flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-3 gap-2">
        <SheetStat label="Distance" value={track ? `${Math.round(track.distance_km)} km` : "—"} />
        <SheetStat
          label="Duration"
          value={track ? formatDuration(track.duration_min) : "—"}
        />
        <SheetStat
          label="Gaps"
          value={track ? `${track.gaps.length}` : "—"}
        />
      </div>

      <div className="mt-3 flex-1 min-h-[180px] border border-border rounded-[8px] overflow-hidden">
        {error ? (
          <div className="h-full flex items-center justify-center text-[13px] text-warning px-3 text-center">
            {error}
          </div>
        ) : track ? (
          <AltitudeChart waypoints={track.waypoints} gaps={track.gaps} />
        ) : (
          <div className="h-full flex items-center justify-center text-[13px] text-text-secondary">
            Loading track…
          </div>
        )}
      </div>
    </div>
  );
}

function SheetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-[2px] p-2.5">
      <div className="text-[10px] font-mono-data uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className="mt-1 text-[15px] font-mono-data">{value}</div>
    </div>
  );
}

function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : `${h}h ${m.toString().padStart(2, "0")}m`;
}
