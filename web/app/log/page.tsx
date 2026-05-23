import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOwnerOrRedirect } from "@/lib/session";
import { flightCardSelect } from "@/lib/flights";
import { FlightCard } from "@/components/flight-card";

export const metadata = { title: "Log — Aloft" };
export const dynamic = "force-dynamic";

type Search = { searchParams: Promise<{ year?: string }> };

export default async function LogPage({ searchParams }: Search) {
  const { year } = await searchParams;
  const owner = await requireOwnerOrRedirect();

  const yearNum = year && /^\d{4}$/.test(year) ? Number(year) : null;
  const dateWhere = yearNum
    ? {
        date: {
          gte: new Date(Date.UTC(yearNum, 0, 1)),
          lt: new Date(Date.UTC(yearNum + 1, 0, 1)),
        },
      }
    : {};

  const flights = await prisma.flight.findMany({
    where: { userId: owner.id, ...dateWhere },
    orderBy: [{ date: "desc" }, { firstSeenUtc: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: flightCardSelect,
  });

  return (
    <div className="px-5 py-6 pt-[calc(env(safe-area-inset-top)+16px)]">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[22px] leading-7 font-light">
            {yearNum ? `Log · ${yearNum}` : "Flight log"}
          </h1>
          <p className="mt-1 text-[14px] text-text-secondary">
            {flights.length} flight{flights.length === 1 ? "" : "s"} · most recent first
          </p>
        </div>
        {yearNum && (
          <Link
            href="/log"
            className="text-[13px] font-mono-data text-accent active:text-text-primary"
          >
            ← all years
          </Link>
        )}
      </header>

      {flights.length === 0 ? (
        <div className="mt-10 border border-dashed border-border rounded-[2px] p-8 text-center text-text-secondary">
          <div>{yearNum ? `No flights in ${yearNum}.` : "No flights yet."}</div>
          <div className="mt-1 text-[13px]">
            {yearNum ? (
              <>
                <Link href="/log" className="text-accent">View all flights</Link>.
              </>
            ) : (
              <>Tap <span className="text-accent">+</span> to add one.</>
            )}
          </div>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {flights.map((f) => (
            <li key={f.id}>
              <FlightCard flight={f} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
