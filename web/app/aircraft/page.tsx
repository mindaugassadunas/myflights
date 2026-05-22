import Link from "next/link";
import { format } from "date-fns";
import { requireOwner } from "@/lib/session";
import { sameTailGroups } from "@/lib/aircraft";

export const metadata = { title: "Aircraft — Aloft" };
export const dynamic = "force-dynamic";

export default async function AircraftIndexPage() {
  const owner = await requireOwner();
  const groups = await sameTailGroups(owner.id);

  return (
    <div className="px-5 py-6 pt-[calc(env(safe-area-inset-top)+16px)]">
      <header>
        <h1 className="text-[22px] leading-7 font-light">Aircraft</h1>
        <p className="mt-1 text-[14px] text-text-secondary">
          Airframes you&apos;ve flown more than once.
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="mt-10 border border-dashed border-border rounded-[2px] p-8 text-center text-text-secondary">
          <div>No repeat airframes yet.</div>
          <div className="mt-1 text-[13px]">
            Same-tail detection kicks in once you&apos;ve flown the same{" "}
            <span className="font-mono-data">icao24</span> ≥ 2 times.
          </div>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {groups.map((g) => (
            <li key={g.icao24}>
              <Link
                href={`/aircraft/${g.icao24}`}
                className="block bg-surface border border-border rounded-[2px] px-5 py-4 active:bg-surface-elevated"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="font-mono-data text-[18px] leading-6">
                      {g.registration ?? g.icao24.toUpperCase()}
                    </div>
                    <div className="mt-0.5 text-[14px] text-text-secondary">
                      {[g.typeCode, g.manufacturer, g.model].filter(Boolean).join(" · ")}
                      {g.operator ? ` · ${g.operator}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] font-mono-data text-accent">
                      ×{g.flightCount}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[12px] font-mono-data text-text-secondary">
                  {format(g.firstDate, "d MMM yyyy")} → {format(g.lastDate, "d MMM yyyy")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
