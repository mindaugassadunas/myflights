import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";

export const metadata = { title: "Trips — Aloft" };
export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const owner = await requireOwner();
  const trips = await prisma.trip.findMany({
    where: { userId: owner.id },
    orderBy: { startUtc: "desc" },
    include: {
      flights: {
        orderBy: { date: "asc" },
        include: { depAirport: true, arrAirport: true },
      },
    },
  });

  return (
    <div className="px-5 py-6 pt-[calc(env(safe-area-inset-top)+16px)]">
      <header>
        <h1 className="text-[22px] leading-7 font-light">Trips</h1>
        <p className="mt-1 text-[14px] text-text-secondary">
          {trips.length} trip{trips.length === 1 ? "" : "s"} · auto-clustered nightly
        </p>
      </header>

      {trips.length === 0 ? (
        <div className="mt-10 border border-dashed border-border rounded-[2px] p-8 text-center text-text-secondary">
          <div>No trips yet.</div>
          <div className="mt-1 text-[13px]">
            Clustering runs nightly. Re-run manually via{" "}
            <span className="font-mono-data text-accent">/api/cron/cluster-trips</span>.
          </div>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {trips.map((t) => {
            const km = t.flights.reduce((s, f) => s + (f.distanceKm ?? 0), 0);
            const codes = compressedRoute(t.flights);
            return (
              <li key={t.id} className="bg-surface border border-border rounded-[2px] px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[18px] leading-6">{t.label ?? "Untitled trip"}</h2>
                  <div className="text-[14px] font-mono-data text-text-secondary">
                    {t.flights.length} leg{t.flights.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="mt-1 text-[13px] font-mono-data text-text-secondary">
                  {format(t.startUtc, "d MMM")} → {format(t.endUtc, "d MMM yyyy")}
                  {" · "}
                  {Math.round(km).toLocaleString()} km
                </div>
                <div className="mt-3 font-mono-data text-[14px] text-text-primary truncate">
                  {codes}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {t.flights.map((f) => (
                    <li key={f.id}>
                      <Link
                        href={`/flights/${f.id}`}
                        className="block text-[13px] font-mono-data text-text-secondary hover:text-text-primary"
                      >
                        {format(f.date, "dd MMM")} · {f.depAirport.iata ?? f.depAirport.icao}{" "}
                        → {f.arrAirport.iata ?? f.arrAirport.icao}
                        {f.callsign ? ` · ${f.callsign}` : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function compressedRoute(
  flights: Array<{ depAirport: { iata: string | null; icao: string | null }; arrAirport: { iata: string | null; icao: string | null } }>,
): string {
  if (flights.length === 0) return "";
  const codes: string[] = [flights[0].depAirport.iata ?? flights[0].depAirport.icao ?? "—"];
  for (const f of flights) {
    codes.push(f.arrAirport.iata ?? f.arrAirport.icao ?? "—");
  }
  return codes.join(" → ");
}
