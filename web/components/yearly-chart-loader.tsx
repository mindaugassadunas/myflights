"use client";

import nextDynamic from "next/dynamic";

/**
 * Lazy-load Recharts so /stats's First Load JS stays under 200 KB.
 */
const YearlyChart = nextDynamic(
  () => import("./yearly-chart").then((m) => m.YearlyChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-40 w-full bg-surface-elevated animate-pulse rounded-[2px]" aria-busy="true" />
    ),
  },
);

export default YearlyChart;
