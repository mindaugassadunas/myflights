import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import { flightInclude } from "@/lib/flights";
import { interpolateGreatCircle } from "@/lib/great-circle";
import { FlightStatusBadge } from "@/components/flight-status-badge";
import { FlightDetailActions } from "@/components/flight-detail-actions";
import { PendingRefresh } from "@/components/pending-refresh";
import FlightMap from "@/components/map/flight-map-loader";
import AltitudeChart from "@/components/altitude-chart-loader";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

// Perpendicular bow for synthesised great-circles so dep→arr and arr→dep
// render on opposite sides instead of overlapping. ~0.3° is enough to
// separate them at typical zooms without looking obviously wrong.
const GC_BOW_DEG = 0.3;

export default async function FlightDetailPage({ params }: Params) {
  const { id } = await params;
  const owner = await requireOwner();
  const flight = await prisma.flight.findFirst({
    where: { id, userId: owner.id },
    include: { ...flightInclude, track: true },
  });
  if (!flight) notFound();

  const dep = flight.depAirport;
  const arr = flight.arrAirport;
  const isResolved = flight.resolutionStatus === "resolved";
  const isNoCoverage = flight.resolutionStatus === "no_coverage";
  const isPending = flight.resolutionStatus === "pending";
  const waypoints = Array.isArray(flight.track?.waypoints) ? flight.track.waypoints : [];
  const gaps = Array.isArray(flight.track?.gaps) ? flight.track.gaps : [];
  // Prefer the resolver-stored great-circle; fall back to one synthesised
  // from the two airports so no_coverage flights still get a dashed
  // booked-route line instead of just two endpoint dots.
  const storedGc = Array.isArray(flight.track?.greatCircle) ? flight.track.greatCircle : [];
  const greatCircle = storedGc.length >= 2
    ? storedGc
    : interpolateGreatCircle(
        { lat: dep.latitude, lon: dep.longitude },
        { lat: arr.latitude, lon: arr.longitude },
        { bowDeg: GC_BOW_DEG },
      );
  const hasAdsbTrack = waypoints.length >= 2;
  const gapCount = gaps.length;
  const showResolutionIssue = Boolean(flight.resolutionError) && !isNoCoverage;

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)] pb-10">
      {isPending && <PendingRefresh />}
      <header className="px-5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[22px] leading-7 font-light">
            <span className="font-mono-data">{dep.iata ?? dep.icao}</span>{" "}
            <span className="text-text-secondary">→</span>{" "}
            <span className="font-mono-data">{arr.iata ?? arr.icao}</span>
          </h1>
          <FlightStatusBadge status={flight.resolutionStatus} />
        </div>
        <p className="mt-1 text-[14px] text-text-secondary">
          {format(flight.date, "EEEE d MMMM yyyy")}
        </p>
        <p className="mt-0.5 text-[14px] text-text-secondary">
          {dep.name} → {arr.name}
        </p>
      </header>

      <section className="mt-6 mx-5 grid grid-cols-3 gap-3">
        <Stat label="Callsign" value={flight.callsign ?? "—"} mono />
        {flight.registration && (
          <Stat label="Tail" value={flight.registration} mono />
        )}
        {flight.aircraftType?.icaoCode && (
          <Stat label="Aircraft" value={flight.aircraftType.icaoCode} mono />
        )}
        {flight.icao24 && (
          <Stat
            label="ICAO24"
            value={flight.icao24}
            mono
            href={`/aircraft/${flight.icao24}`}
          />
        )}
        <Stat
          label="Distance · km"
          value={flight.distanceKm ? Math.round(flight.distanceKm).toLocaleString() : "—"}
          mono
        />
        <Stat
          label="Duration"
          value={flight.durationMin ? formatDuration(flight.durationMin) : "—"}
          mono
        />
      </section>

      {isResolved && hasAdsbTrack && (
        <section className="mt-4 mx-5 bg-surface border border-border rounded-[2px] p-4">
          <div className="text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
            ADS-B coverage
          </div>
          <div className="mt-2 text-[14px]">
            {flight.track?.pointCount ?? 0} waypoints · {gapCount} gap{gapCount === 1 ? "" : "s"}
          </div>
        </section>
      )}

      {isNoCoverage && (
        <section className="mt-4 mx-5 bg-surface border border-border rounded-[2px] p-4">
          <div className="text-[12px] font-mono-data uppercase tracking-wider text-warning">
            ADS-B unavailable
          </div>
          <div className="mt-2 text-[14px] text-text-secondary">
            Showing the booked route because OpenSky did not return a reliable track for this flight.
          </div>
        </section>
      )}

      {showResolutionIssue && (
        <section className="mt-4 mx-5 bg-warning/10 border border-warning/40 rounded-[2px] p-4">
          <div className="text-[12px] font-mono-data uppercase tracking-wider text-warning">
            Resolution issue
          </div>
          <div className="mt-2 text-[14px] text-text-primary">{flight.resolutionError}</div>
        </section>
      )}

      <section className="mt-6 mx-5 relative h-72 border border-border rounded-[2px] overflow-hidden">
        <FlightMap
          waypoints={waypoints as never}
          gaps={gaps as never}
          greatCircle={greatCircle as never}
          dep={{ lat: dep.latitude, lon: dep.longitude, code: dep.iata ?? dep.icao }}
          arr={{ lat: arr.latitude, lon: arr.longitude, code: arr.iata ?? arr.icao }}
        />
      </section>

      {hasAdsbTrack && (
        <section className="mt-4 mx-5 relative h-56 border border-border rounded-[2px] overflow-hidden bg-surface">
          <AltitudeChart
            waypoints={waypoints as never}
            gaps={gaps as never}
          />
        </section>
      )}

      <FlightDetailActions
        flightId={flight.id}
        canRetry={!isResolved}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  const valueCls = mono
    ? `mt-1 text-[16px] font-mono-data${href ? " text-accent" : ""}`
    : "mt-1 text-[16px]";
  const inner = (
    <>
      <div className="text-[11px] font-mono-data uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className={valueCls}>{value}</div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="bg-surface border border-border rounded-[2px] p-3 active:bg-surface-elevated"
      >
        {inner}
      </Link>
    );
  }
  return <div className="bg-surface border border-border rounded-[2px] p-3">{inner}</div>;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

