import Link from "next/link";
import { format } from "date-fns";
import { FlightStatusBadge } from "@/components/flight-status-badge";
import type { FlightCardRow } from "@/lib/flights";

export function FlightCard({ flight }: { flight: FlightCardRow }) {
  const dep = flight.depAirport.iata ?? flight.depAirport.icao ?? "—";
  const arr = flight.arrAirport.iata ?? flight.arrAirport.icao ?? "—";
  const dateStr = format(flight.date, "EEE d MMM yyyy");
  const meta = [
    flight.callsign,
    flight.aircraftType?.icaoCode,
    flight.durationMin ? formatDuration(flight.durationMin) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/flights/${flight.id}`}
      className="block bg-surface border border-border rounded-[2px] px-5 py-4 active:bg-surface-elevated"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono-data text-[18px] leading-6 text-text-primary">
            {dep}{" "}
            <span className="text-text-secondary">→</span>{" "}
            {arr}
          </div>
          <div className="mt-0.5 text-[14px] text-text-secondary">{dateStr}</div>
        </div>
        <FlightStatusBadge status={flight.resolutionStatus} />
      </div>
      {meta && (
        <div className="mt-2 text-[13px] font-mono-data text-text-secondary">{meta}</div>
      )}
    </Link>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
