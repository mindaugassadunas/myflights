import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import { getEquivalents, getRecords, getYearlyTotals } from "@/lib/stats";
import YearlyChart from "@/components/yearly-chart-loader";

export const metadata = { title: "Stats — Aloft" };
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const owner = await requireOwner();

  const [yearly, records, flights] = await Promise.all([
    getYearlyTotals(owner.id),
    getRecords(owner.id),
    prisma.flight.findMany({
      where: { userId: owner.id, resolutionStatus: { in: ["resolved", "no_coverage"] } },
      select: {
        distanceKm: true,
        durationMin: true,
        co2Kg: true,
        depAirportId: true,
        arrAirportId: true,
        depAirport: { select: { isoCountry: true } },
        arrAirport: { select: { isoCountry: true } },
      },
    }),
  ]);

  const totals = flights.reduce(
    (acc, f) => {
      acc.flights += 1;
      acc.distanceKm += f.distanceKm ?? 0;
      acc.durationMin += f.durationMin ?? 0;
      acc.co2Kg += f.co2Kg ?? 0;
      acc.airportIds.add(f.depAirportId);
      acc.airportIds.add(f.arrAirportId);
      if (f.depAirport.isoCountry) acc.countries.add(f.depAirport.isoCountry);
      if (f.arrAirport.isoCountry) acc.countries.add(f.arrAirport.isoCountry);
      return acc;
    },
    {
      flights: 0,
      distanceKm: 0,
      durationMin: 0,
      co2Kg: 0,
      airportIds: new Set<string>(),
      countries: new Set<string>(),
    },
  );

  const equivalents = getEquivalents(totals.distanceKm, totals.co2Kg);
  const chartData = yearly.map((y) => ({
    year: y.year,
    flights: y.flights,
    km: Math.round(y.distanceKm),
    hours: Math.round(y.hours * 10) / 10,
  }));

  return (
    <div className="px-5 py-6 pt-[calc(env(safe-area-inset-top)+16px)] space-y-5 pb-10">
      <header>
        <h1 className="text-[22px] leading-7 font-light">Lifetime</h1>
        <p className="mt-1 text-[14px] text-text-secondary">
          Across {totals.flights} resolved flight{totals.flights === 1 ? "" : "s"}.
        </p>
      </header>

      <section className="bg-surface border border-border rounded-[2px] p-5">
        <div className="text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
          Distance · km
        </div>
        <div className="mt-2 text-[36px] leading-10 font-mono-data">
          {Math.round(totals.distanceKm).toLocaleString()}
        </div>
        <div className="mt-1 text-[13px] text-text-secondary">
          {(totals.distanceKm / 40075).toFixed(2)} times around Earth
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Flights" value={totals.flights.toLocaleString()} />
        <Stat label="Hours airborne" value={(totals.durationMin / 60).toFixed(1)} />
        <Stat label="Airports" value={totals.airportIds.size.toLocaleString()} />
        <Stat label="Countries" value={totals.countries.size.toLocaleString()} />
      </div>

      <section>
        <h2 className="text-[14px] font-mono-data uppercase tracking-wider text-text-secondary mb-3">
          Records
        </h2>
        <ul className="space-y-2">
          {records.longestDistance && (
            <RecordRow record={records.longestDistance} />
          )}
          {records.shortestDistance && (
            <RecordRow record={records.shortestDistance} />
          )}
          {records.busiestYear && (
            <RecordRowText
              label="Busiest year"
              metric={`${records.busiestYear.count}`}
              detail={`${records.busiestYear.year}`}
              href={`/log?year=${records.busiestYear.year}`}
            />
          )}
          {records.longestGapDays && (
            <RecordRowText
              label="Longest gap between flights"
              metric={`${records.longestGapDays.days} ${records.longestGapDays.days === 1 ? "day" : "days"}`}
              detail={`${records.longestGapDays.from} → ${records.longestGapDays.to}`}
            />
          )}
        </ul>
      </section>

      {equivalents.length > 0 && (
        <section>
          <h2 className="text-[14px] font-mono-data uppercase tracking-wider text-text-secondary mb-3">
            Equivalents
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {equivalents.map((eq) => (
              <div key={eq.label} className="bg-surface border border-border rounded-[2px] p-3">
                <div className="text-[11px] font-mono-data uppercase tracking-wider text-text-secondary">
                  {eq.label}
                </div>
                <div className="mt-1 text-[18px] font-mono-data">{eq.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {chartData.length > 0 && (
        <section>
          <h2 className="text-[14px] font-mono-data uppercase tracking-wider text-text-secondary mb-3">
            Year by year
          </h2>
          <div className="bg-surface border border-border rounded-[2px] p-3">
            <div className="flex items-center gap-4 mb-2 text-[12px]">
              <LegendDot color="#00D4FF" label="Flights" />
              <LegendDot color="#E8A547" label="Distance · km" />
            </div>
            <YearlyChart data={chartData} />
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface border border-border rounded-[2px] p-4">
      <div className="text-[11px] font-mono-data uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className="mt-2 text-[24px] font-mono-data">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-text-secondary">{hint}</div>}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-text-secondary font-mono-data uppercase tracking-wider text-[11px]">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      <span>{label}</span>
    </div>
  );
}

function RecordRow({
  record,
}: {
  record: { flightId: string; label: string; detail: string; metric: string };
}) {
  return (
    <li>
      <Link
        href={`/flights/${record.flightId}`}
        className="flex items-center justify-between bg-surface border border-border rounded-[2px] px-4 py-3 active:bg-surface-elevated"
      >
        <div>
          <div className="text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
            {record.label}
          </div>
          <div className="mt-0.5 font-mono-data text-[15px]">{record.detail}</div>
        </div>
        <div className="text-[18px] font-mono-data text-accent">{record.metric}</div>
      </Link>
    </li>
  );
}

function RecordRowText({
  label,
  metric,
  detail,
  href,
}: {
  label: string;
  metric: string;
  detail: string;
  href?: string;
}) {
  const inner = (
    <>
      <div>
        <div className="text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
          {label}
        </div>
        <div className="mt-0.5 font-mono-data text-[15px]">{detail}</div>
      </div>
      <div className="text-[18px] font-mono-data text-accent">{metric}</div>
    </>
  );
  if (href) {
    return (
      <li>
        <Link
          href={href}
          className="flex items-center justify-between bg-surface border border-border rounded-[2px] px-4 py-3 active:bg-surface-elevated"
        >
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between bg-surface border border-border rounded-[2px] px-4 py-3">
      {inner}
    </li>
  );
}
