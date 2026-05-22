"use client";

import nextDynamic from "next/dynamic";
import { MapCanvasSkeleton } from "@/components/map/map-canvas-skeleton";
import type { WorldMapProps } from "./world-map";

/**
 * Client-side wrapper so `ssr: false` is legal — Next.js 15 forbids it in
 * server components, but the map can't render server-side anyway.
 */
const WorldMap = nextDynamic<WorldMapProps>(
  () => import("./world-map").then((m) => m.WorldMap),
  {
    ssr: false,
    loading: () => <MapCanvasSkeleton />,
  },
);

export default WorldMap;
