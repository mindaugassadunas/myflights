"use client";

import nextDynamic from "next/dynamic";

const FlightMap = nextDynamic(
  () => import("./flight-map").then((m) => m.FlightMap),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 bg-surface animate-pulse" aria-busy="true" />
    ),
  },
);

export default FlightMap;
