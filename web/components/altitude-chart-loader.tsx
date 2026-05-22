"use client";

import nextDynamic from "next/dynamic";

/**
 * Plotly is ~1MB even in its basic build. Load it only when the user
 * actually expands a flight detail (sheet at full snap, or the standalone
 * detail page).
 */
const AltitudeChart = nextDynamic(
  () => import("./altitude-chart").then((m) => m.AltitudeChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-surface animate-pulse" aria-busy="true" />
    ),
  },
);

export default AltitudeChart;
