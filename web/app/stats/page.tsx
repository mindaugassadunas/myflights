import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import { getRecords, getTopList, getYearlyTotals } from "@/lib/stats";
import YearlyChart from "@/components/yearly-chart-loader";

export const metadata = { title: "Stats — Aloft" };
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const owner = await requireOwner();

  const [yearly, records, top, flights] = await Promise.all([
    getYearlyTotals(owner.id),
    getRecords(owner.id),
    getTopList(owner.id),
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

  const chartData = yearly.map((y) => ({
    year: y.year,
    flights: y.flights,
    km: Math.round(y.distanceKm),
    hours: Math.round(y.hours * 10) / 10,
  }));

  const earthLaps = totals.distanceKm / 40075;
  const hours = totals.durationMin / 60;
  const distance = Math.round(totals.distanceKm).toLocaleString();

  const hasTopList = top.route || top.airline || top.aircraftType;

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+16px)] pb-12">
      {/* ─────────────────────────────────────── HERO ────────────────────── */}
      <header className="px-5 mb-10">
        <div className="flex items-end gap-4 border-b-2 border-accent/60 pb-3">
          <span className="font-mono-data uppercase tracking-[0.22em] text-text-primary text-[18px] leading-none">
            Lifetime
          </span>
          <span className="h-px flex-1 bg-border mb-2" />
          <span className="font-mono-data uppercase tracking-[0.18em] text-text-secondary text-[11px] leading-none">
            {totals.flights} flight{totals.flights === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-3">
            <h1 className="font-mono-data text-text-primary text-[64px] leading-[1] tracking-tight">
              {distance}
            </h1>
            <span className="text-[24px] leading-none font-mono-data uppercase tracking-wider text-text-secondary">
              km
            </span>
          </div>
          <div className="flex items-baseline gap-2 leading-none">
            <span className="font-mono-data text-accent text-[28px] leading-none tabular-nums">
              {earthLaps.toFixed(2)}×
            </span>
            <span className="font-mono-data uppercase tracking-[0.14em] text-text-secondary text-[12px]">
              around Earth
            </span>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────── INLINE STAT RIBBON ──────────────── */}
      <section className="px-5 mb-12">
        <div className="border-y border-border divide-x divide-border grid grid-cols-3">
          <RibbonStat
            label="Hours airborne"
            value={hours < 100 ? hours.toFixed(1) : Math.round(hours).toLocaleString()}
            unit="h"
          />
          <RibbonStat label="Airports" value={totals.airportIds.size.toLocaleString()} />
          <RibbonStat label="Countries" value={totals.countries.size.toLocaleString()} />
        </div>
      </section>

      {/* ─────────────────────────────── MOST FLOWN ──────────────────────── */}
      {hasTopList && (
        <section className="px-5 mb-14">
          <SectionHead
            index="01"
            title="Most flown"
            caption="Top route, airline, and airframe"
          />
          <ul className="mt-5">
            {top.route && (
              <TopRow
                kind="Route"
                primary={`${top.route.dep}  →  ${top.route.arr}`}
                count={top.route.count}
              />
            )}
            {top.airline && (
              <TopRow
                kind="Airline"
                primary={top.airline.name}
                meta={top.airline.iata ?? top.airline.icao ?? null}
                count={top.airline.count}
              />
            )}
            {top.aircraftType && (
              <TopRow
                kind="Aircraft"
                primary={top.aircraftType.code}
                meta={[top.aircraftType.manufacturer, top.aircraftType.model]
                  .filter(Boolean)
                  .join(" ") || null}
                count={top.aircraftType.count}
              />
            )}
          </ul>
        </section>
      )}

      {/* ─────────────────────────────── RECORDS ─────────────────────────── */}
      <section className="px-5 mb-14">
        <SectionHead
          index={hasTopList ? "02" : "01"}
          title="Records"
          caption="Personal bests and bookends"
        />
        <ul className="mt-5">
          {records.longestDistance && <RecordRow record={records.longestDistance} />}
          {records.shortestDistance && <RecordRow record={records.shortestDistance} />}
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
              metric={`${records.longestGapDays.days} ${
                records.longestGapDays.days === 1 ? "day" : "days"
              }`}
              detail={`${records.longestGapDays.from} → ${records.longestGapDays.to}`}
            />
          )}
        </ul>
      </section>

      {/* ─────────────────────────────── YEAR BY YEAR ────────────────────── */}
      {chartData.length > 0 && (
        <section className="px-5">
          <SectionHead
            index={String(1 + (hasTopList ? 1 : 0) + 1).padStart(2, "0")}
            title="Year by year"
            caption="Flight count and distance by year"
          />
          <div className="mt-5">
            <div className="flex items-center gap-4 mb-3 text-[12px]">
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

/* ────────────────────────────────── primitives ─────────────────────────── */

function SectionHead({
  index,
  title,
  caption,
}: {
  index: string;
  title: string;
  caption?: string;
}) {
  return (
    <div className="flex items-start gap-4 pb-3 border-b border-accent/30">
      {/* Oversized chapter number — graphical kicker that anchors each
          section to the page rhythm without needing chrome around it. */}
      <span
        aria-hidden
        className="font-mono-data text-[44px] leading-[0.9] text-text-secondary/25 tracking-tight tabular-nums"
      >
        {index}
      </span>
      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[22px] leading-7 font-light text-text-primary">
            {title}
          </h2>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent inline-block" />
        </div>
        {caption && (
          <p className="mt-0.5 text-[12px] font-mono-data uppercase tracking-[0.14em] text-text-secondary">
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}

function RibbonStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="px-3 py-4">
      <div className="text-[10px] font-mono-data uppercase tracking-[0.18em] text-text-secondary">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[26px] leading-7 font-mono-data text-text-primary">
          {value}
        </span>
        {unit && (
          <span className="text-[13px] font-mono-data uppercase tracking-wider text-text-secondary">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function TopRow({
  kind,
  primary,
  meta,
  count,
}: {
  kind: string;
  primary: string;
  meta?: string | null;
  count: number;
}) {
  return (
    <li className="grid grid-cols-[80px_1fr_auto] items-center gap-3 py-4 border-b border-border last:border-b-0">
      <span className="text-[11px] font-mono-data uppercase tracking-[0.18em] text-text-secondary">
        {kind}
      </span>
      <div className="min-w-0">
        <div className="font-mono-data text-[18px] leading-6 text-text-primary truncate">
          {primary}
        </div>
        {meta && (
          <div className="text-[12px] text-text-secondary truncate">{meta}</div>
        )}
      </div>
      <div className="text-right">
        <div className="font-mono-data text-[22px] leading-6 text-accent">
          ×{count}
        </div>
      </div>
    </li>
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
        className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-4 border-b border-border last:border-b-0 active:opacity-70"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-mono-data uppercase tracking-[0.18em] text-text-secondary">
            {record.label}
          </div>
          <div className="mt-1 font-mono-data text-[18px] leading-6 truncate">
            {record.detail}
          </div>
        </div>
        <div className="font-mono-data text-[22px] leading-6 text-accent whitespace-nowrap">
          {record.metric}
        </div>
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
      <div className="min-w-0">
        <div className="text-[11px] font-mono-data uppercase tracking-[0.18em] text-text-secondary">
          {label}
        </div>
        <div className="mt-1 font-mono-data text-[18px] leading-6 truncate">{detail}</div>
      </div>
      <div className="font-mono-data text-[22px] leading-6 text-accent whitespace-nowrap">
        {metric}
      </div>
    </>
  );
  if (href) {
    return (
      <li>
        <Link
          href={href}
          className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-4 border-b border-border last:border-b-0 active:opacity-70"
        >
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-4 border-b border-border last:border-b-0">
      {inner}
    </li>
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
