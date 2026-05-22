"use client";

import * as React from "react";
import maplibregl, { type ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ALOFT_DARK_MAP_STYLE } from "@/components/map/map-style";

type Waypoint = {
  t: number;
  lat: number;
  lon: number;
  alt_m: number | null;
  heading: number | null;
  on_ground: boolean;
};

type GreatCirclePoint = { lat: number; lon: number };

type Gap = { start: number; end: number; duration_s: number };

type Props = {
  waypoints: Waypoint[];
  gaps: Gap[];
  greatCircle: GreatCirclePoint[];
  dep: { lat: number; lon: number; code: string | null };
  arr: { lat: number; lon: number; code: string | null };
};

/**
 * Per-flight map. Shows:
 *   - the ADS-B trace as a single line colored by altitude (line-gradient)
 *   - the great-circle reference as a thin dashed line
 *   - endpoint markers for departure and arrival
 *
 * MapLibre's `line-gradient` requires the layer's source to use a single
 * LineString with `lineMetrics: true`. We feed it the cleaned waypoints
 * directly; downsampling already happened upstream.
 */
export function FlightMap({ waypoints, gaps, greatCircle, dep, arr }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cleanWaypoints = waypoints.filter((w) => isValidLngLat(w.lon, w.lat));
    const cleanGreatCircle = greatCircle.filter((p) => isValidLngLat(p.lon, p.lat));
    const hasDep = isValidLngLat(dep.lon, dep.lat);
    const hasArr = isValidLngLat(arr.lon, arr.lat);
    if (!hasDep || !hasArr) return;

    const map = new maplibregl.Map({
      container,
      style: ALOFT_DARK_MAP_STYLE,
      center: [(dep.lon + arr.lon) / 2, (dep.lat + arr.lat) / 2],
      zoom: 4,
      attributionControl: { compact: true },
      renderWorldCopies: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("error", (e) => {
      // eslint-disable-next-line no-console
      console.error("[flight-map]", (e as { error?: Error }).error);
    });

    map.on("load", () => {
      // Great-circle reference (drawn first so the ADS-B line sits on top).
      if (cleanGreatCircle.length >= 2) {
        map.addSource("gc", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: cleanGreatCircle.map((p) => [p.lon, p.lat]),
            },
          },
        });
        map.addLayer({
          id: "gc-line",
          type: "line",
          source: "gc",
          paint: {
            "line-color": "#00D4FF",
            "line-opacity": 0.85,
            "line-width": 2,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }

      // ADS-B line with altitude gradient (if we have altitudes).
      if (cleanWaypoints.length >= 2) {
        map.addSource("adsb", {
          type: "geojson",
          lineMetrics: true,
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: cleanWaypoints.map((w) => [w.lon, w.lat]),
            },
          },
        });
        map.addLayer({
          id: "adsb-line",
          type: "line",
          source: "adsb",
          paint: {
            "line-width": 2.5,
            "line-gradient": altitudeGradient(cleanWaypoints),
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });

        // Gap markers — render thin red ticks at the midpoints of each gap.
        if (gaps.length > 0) {
          const gapMarkers = gaps
            .map((g) => interpolateAt(cleanWaypoints, (g.start + g.end) / 2))
            .filter((p): p is { lat: number; lon: number } => p !== null);
          if (gapMarkers.length > 0) {
            map.addSource("gaps", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: gapMarkers.map((p) => ({
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: [p.lon, p.lat] },
                })),
              },
            });
            map.addLayer({
              id: "gap-points",
              type: "circle",
              source: "gaps",
              paint: {
                "circle-radius": 4,
                "circle-color": "#E8A547",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#0A0B0D",
              },
            });
          }
        }
      }

      // Endpoint markers.
      const endpointFeatures: GeoJSON.Feature[] = [
        {
          type: "Feature",
          properties: { code: dep.code ?? "" },
          geometry: { type: "Point", coordinates: [dep.lon, dep.lat] },
        },
        {
          type: "Feature",
          properties: { code: arr.code ?? "" },
          geometry: { type: "Point", coordinates: [arr.lon, arr.lat] },
        },
      ];
      map.addSource("endpoints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: endpointFeatures },
      });
      map.addLayer({
        id: "endpoint-dots",
        type: "circle",
        source: "endpoints",
        paint: {
          "circle-radius": 5,
          "circle-color": "#E8EAED",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0A0B0D",
        },
      });

      // Fit bounds covering everything visible.
      const allLngLats: [number, number][] = [
        [dep.lon, dep.lat],
        [arr.lon, arr.lat],
        ...cleanWaypoints.map((w): [number, number] => [w.lon, w.lat]),
        ...cleanGreatCircle.map((p): [number, number] => [p.lon, p.lat]),
      ];
      const bounds = boundsOf(allLngLats);
      if (bounds) map.fitBounds(bounds, { padding: 48, duration: 0 });
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    const resizeFrame = window.requestAnimationFrame(() => map.resize());

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      map.remove();
    };
  }, [waypoints, gaps, greatCircle, dep, arr]);

  return (
    <div className="absolute inset-0 bg-bg">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function altitudeGradient(waypoints: Waypoint[]): ExpressionSpecification {
  // Build a line-gradient expression: at each fractional progress along the
  // line, pick a color based on altitude. We compute progress cumulatively
  // via segment length (approximate — Euclidean lat/lon, fine for visual).
  let totalLen = 0;
  const segLens: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].lon - waypoints[i - 1].lon;
    const dy = waypoints[i].lat - waypoints[i - 1].lat;
    totalLen += Math.sqrt(dx * dx + dy * dy);
    segLens.push(totalLen);
  }
  if (totalLen === 0) {
    return ["literal", "#00D4FF"] as unknown as ExpressionSpecification;
  }
  const stops: (number | string)[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    const t = segLens[i] / totalLen;
    stops.push(Math.min(1, Math.max(0, t)), altitudeColor(waypoints[i].alt_m));
  }
  return [
    "interpolate",
    ["linear"],
    ["line-progress"],
    ...stops,
  ] as unknown as ExpressionSpecification;
}

function altitudeColor(altM: number | null): string {
  // Altitude bands tuned to commercial cruising profile.
  //   0     m → deep blue
  //   3000  m → mid blue
  //   6000  m → cyan
  //   9000  m → green
  //   12000 m → amber (FL400+)
  if (altM === null) return "#1976D2";
  if (altM <= 0) return "#0A3A8C";
  if (altM < 3000) return interp("#0A3A8C", "#1976D2", altM / 3000);
  if (altM < 6000) return interp("#1976D2", "#00D4FF", (altM - 3000) / 3000);
  if (altM < 9000) return interp("#00D4FF", "#4ADE80", (altM - 6000) / 3000);
  if (altM < 12000) return interp("#4ADE80", "#E8A547", (altM - 9000) / 3000);
  return "#E8A547";
}

function interp(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function interpolateAt(waypoints: Waypoint[], t: number): { lat: number; lon: number } | null {
  if (waypoints.length === 0) return null;
  if (t <= waypoints[0].t) return { lat: waypoints[0].lat, lon: waypoints[0].lon };
  for (let i = 1; i < waypoints.length; i++) {
    if (t <= waypoints[i].t) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      const f = (t - a.t) / Math.max(1, b.t - a.t);
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
      };
    }
  }
  const last = waypoints[waypoints.length - 1];
  return { lat: last.lat, lon: last.lon };
}

function boundsOf(coords: [number, number][]): maplibregl.LngLatBoundsLike | null {
  if (coords.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity;
  const longitudes: number[] = [];
  for (const [lon, lat] of coords) {
    if (!isValidLngLat(lon, lat)) continue;
    longitudes.push(wrapLongitude(lon));
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (longitudes.length === 0) return null;
  longitudes.sort((a, b) => a - b);

  let largestGap = -Infinity;
  let gapStartIndex = 0;
  for (let i = 0; i < longitudes.length; i++) {
    const current = longitudes[i];
    const next = i === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[i + 1];
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      gapStartIndex = i;
    }
  }

  let minLon = longitudes[(gapStartIndex + 1) % longitudes.length];
  let maxLon = longitudes[gapStartIndex];
  if (maxLon < minLon) maxLon += 360;

  if (maxLon - minLon < 0.05) {
    minLon -= 0.5;
    maxLon += 0.5;
  }
  if (maxLat - minLat < 0.05) {
    minLat -= 0.5;
    maxLat += 0.5;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

function isValidLngLat(lon: number, lat: number) {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

function wrapLongitude(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
