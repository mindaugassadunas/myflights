import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireOwnerOrRedirect } from "@/lib/session";
import { aircraftProfile } from "@/lib/aircraft";
import { getPhotoForAircraft } from "@/lib/planespotters";
import { AircraftPhoto } from "@/components/aircraft-photo";
import { FlightStatusBadge } from "@/components/flight-status-badge";

type Params = { params: Promise<{ icao24: string }> };

export const dynamic = "force-dynamic";

export default async function AircraftProfilePage({ params }: Params) {
  const { icao24 } = await params;
  const owner = await requireOwnerOrRedirect();
  const profile = await aircraftProfile(owner.id, icao24);
  if (!profile) notFound();

  const a = profile.aircraft;
  const photo = await getPhotoForAircraft({
    registration: a?.registration,
    icao24: profile.icao24,
    typeCode: a?.typeCode,
  });

  const title = a?.registration ?? profile.icao24.toUpperCase();
  const subtitle = [a?.typeCode, a?.type?.manufacturer, a?.type?.model ?? a?.model]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)] pb-10">
      <header className="px-5">
        <div className="text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
          Aircraft · {profile.icao24}
        </div>
        <h1 className="mt-1 text-[28px] leading-8 font-mono-data">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-[14px] text-text-secondary">{subtitle}</p>
        )}
      </header>

      <section className="mt-4 mx-5">
        <AircraftPhoto
          photo={photo}
          fallback={
            a?.typeCode
              ? `No photo found for ${a.typeCode}`
              : "No photo available"
          }
        />
      </section>

      <section className="mt-6 mx-5 grid grid-cols-2 gap-3">
        <Stat label="Registration" value={a?.registration ?? "—"} mono />
        <Stat label="Type code"    value={a?.typeCode ?? "—"} mono />
        <Stat label="Manufacturer" value={a?.type?.manufacturer ?? "—"} />
        <Stat label="Model"        value={a?.type?.model ?? a?.model ?? "—"} />
        <Stat label="Year built"   value={a?.yearBuilt?.toString() ?? "—"} mono />
        <Stat label="Operator"     value={a?.operator ?? "—"} />
      </section>

      <section className="mt-6 mx-5">
        <h2 className="text-[14px] font-mono-data uppercase tracking-wider text-text-secondary">
          Your flights · {profile.flights.length}
        </h2>
        {profile.flights.length === 0 ? (
          <div className="mt-3 border border-dashed border-border rounded-[2px] p-5 text-center text-text-secondary text-[14px]">
            None yet on this airframe.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {profile.flights.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/flights/${f.id}`}
                  className="block bg-surface border border-border rounded-[2px] px-4 py-3 active:bg-surface-elevated"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-mono-data text-[15px]">
                      {f.depAirport.iata ?? f.depAirport.icao}{" "}
                      <span className="text-text-secondary">→</span>{" "}
                      {f.arrAirport.iata ?? f.arrAirport.icao}
                    </div>
                    <FlightStatusBadge status={f.resolutionStatus} />
                  </div>
                  <div className="mt-0.5 text-[12px] font-mono-data text-text-secondary">
                    {format(f.date, "d MMM yyyy")} · {f.callsign ?? "—"}
                    {f.distanceKm ? ` · ${Math.round(f.distanceKm)} km` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-[2px] p-3">
      <div className="text-[11px] font-mono-data uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className={mono ? "mt-1 text-[15px] font-mono-data" : "mt-1 text-[15px]"}>
        {value}
      </div>
    </div>
  );
}
