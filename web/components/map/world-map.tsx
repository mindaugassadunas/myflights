"use client";

import * as React from "react";
import maplibregl, {
  type ExpressionSpecification,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Globe, Map as MapIcon } from "lucide-react";
import { FlightSheet, type SelectedFlight } from "@/components/map/flight-sheet";
import { ALOFT_DARK_MAP_STYLE } from "@/components/map/map-style";
import { cn } from "@/lib/utils";

const SOURCE_ID = "flights";
const LAYERS = {
  hit: "flights-hit",
  glow: "flights-glow",
  adsb: "flights-line-adsb",
  greatCircle: "flights-line-great-circle",
} as const;

type Encoding = "default" | "year" | "airline" | "type";
type FlightLoadState = "loading" | "ready" | "empty";

export type WorldMapProps = {
  initialData?: GeoJSON.FeatureCollection | null;
  initialError?: string | null;
};

/**
 * Full-bleed dark-matter world map. Every flight as a polyline,
 * color-coded by user-selected encoding. Globe vs. mercator toggle. Tap
 * a flight → snap-point sheet with summary and lazy-loaded altitude
 * chart. ADS-B and great-circle features both render as solid lines —
 * the great-circle layer keeps slightly lower opacity so an ADS-B trace
 * still reads on top where both exist for the same flight.
 */
export function WorldMap({ initialData = null, initialError = null }: WorldMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const dataRef = React.useRef<GeoJSON.FeatureCollection | null>(null);

  const [selected, setSelected] = React.useState<SelectedFlight | null>(null);
  const [encoding, setEncoding] = React.useState<Encoding>("default");
  const [globe, setGlobe] = React.useState(true);
  const [error, setError] = React.useState<string | null>(initialError);
  const [basemapWarning, setBasemapWarning] = React.useState<string | null>(null);
  const [loadState, setLoadState] = React.useState<FlightLoadState>("loading");

  // ------------------------------------------------------------------- init
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // React 18 Strict Mode mounts effects twice in dev. Without this guard
    // we'd create two MapLibre instances on the same canvas — the first
    // gets .remove()'d before its WebGL context fully initialises, leaving
    // the second instance with a corrupted GPU state. Symptom: tiles
    // download cleanly but never paint.
    if (mapRef.current) return;
    let disposed = false;
    const controller = new AbortController();
    const map = new maplibregl.Map({
      container,
      style: ALOFT_DARK_MAP_STYLE,
      center: [10, 30],
      zoom: 1.4,
      attributionControl: { compact: true },
      renderWorldCopies: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Surface MapLibre runtime errors instead of swallowing them. Without
    // this, things like WebGL-context loss or style-parse failures just
    // leave a black canvas with no signal.
    map.on("error", (e) => {
      const err = (e as { error?: Error }).error;
      const msg = err?.message ?? "map error";
      // eslint-disable-next-line no-console
      console.warn("[world-map]", msg, err);
      if (isBasemapTileError(msg)) {
        setBasemapWarning("Basemap tiles unavailable. Flight routes are still shown.");
        return;
      }
      setError(msg);
    });

    map.on("load", async () => {
      if (disposed) return;
      try {
        setLoadState("loading");
        setError(null);

        // Set projection before fitBounds — globe vs mercator have
        // different effective fields of view, and `fitBounds` is
        // projection-aware. Doing it in the other order leaves the
        // camera framed for mercator while the canvas renders the globe.
        try {
          map.setProjection({ type: globe ? "globe" : "mercator" });
        } catch {
          // Older MapLibre builds — projection-toggle effect handles it.
        }

        if (initialError) {
          setError(initialError);
          setLoadState("empty");
          return;
        }

        const data = initialData
          ? normalizeFeatureCollection(initialData)
          : await fetchFlightFeatures(controller.signal);
        if (disposed) return;
        dataRef.current = data;

        map.addSource(SOURCE_ID, { type: "geojson", data });
        addFlightLayers(map);

        if ((data.features?.length ?? 0) > 0) {
          const b = computeBounds(data);
          if (b) {
            // Cap the fit-zoom so a single short flight (VNO→HAM, say)
            // doesn't snap the camera in past "globe view". With maxZoom
            // around 3 you still see the planet's curvature; without it
            // a one-leg log frames at zoom 5+ and looks flat.
            const padding = globe ? 96 : 48;
            const maxZoom = globe ? 3 : 6;
            map.fitBounds(b, { padding, maxZoom, duration: 0 });
          }
          setLoadState("ready");
        } else {
          setLoadState("empty");
        }

        const onClick = (e: MapMouseEvent) => {
          const features = map.queryRenderedFeatures(e.point, { layers: [LAYERS.hit] });
          if (features.length === 0) return;
          const props = features[0].properties as SelectedFlight;
          setSelected(props);
        };
        map.on("click", LAYERS.hit, onClick);
        map.on("mouseenter", LAYERS.hit, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYERS.hit, () => {
          map.getCanvas().style.cursor = "";
        });
      } catch (err) {
        if (!disposed && !controller.signal.aborted) {
          setError((err as Error).message);
        }
      }
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    const resizeFrame = window.requestAnimationFrame(() => map.resize());

    return () => {
      disposed = true;
      controller.abort();
      resizeObserver.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      map.remove();
      mapRef.current = null;
    };
  }, [initialData, initialError]);

  // ------------------------------------------- recolor on encoding change
  React.useEffect(() => {
    const map = mapRef.current;
    const data = dataRef.current;
    if (!map || !data || !map.isStyleLoaded()) return;
    const color = buildColorExpression(encoding, data);
    for (const layerId of [LAYERS.glow, LAYERS.adsb, LAYERS.greatCircle]) {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, "line-color", color);
      }
    }
  }, [encoding]);

  // ---------------------------------------------- projection toggle (globe)
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      try {
        map.setProjection({ type: globe ? "globe" : "mercator" });
      } catch {
        // Older MapLibre builds may not support setProjection — silently skip.
      }
    };
    // setProjection silently no-ops if the style hasn't finished loading,
    // so on first mount we have to wait for the `load` event. After that
    // it can be applied synchronously.
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
      return () => {
        map.off("load", apply);
      };
    }
  }, [globe]);

  return (
    <>
      <div className="fixed inset-0 z-0 bg-bg">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      <Toolbar
        encoding={encoding}
        onEncoding={setEncoding}
        globe={globe}
        onGlobe={setGlobe}
      />

      {error && (
        <MapNotice tone="warning" title="Flight data unavailable" detail={error} />
      )}

      {!error && basemapWarning && (
        <MapNotice tone="muted" title="Basemap unavailable" detail={basemapWarning} />
      )}

      {!error && loadState === "loading" && (
        <MapNotice tone="muted" title="Loading flights" />
      )}

      {!error && loadState === "empty" && (
        <MapNotice
          tone="muted"
          title="No mapped flights yet"
          detail="Resolved or no-coverage flights will appear here."
        />
      )}

      <FlightSheet
        flight={selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </>
  );
}

function MapNotice({
  title,
  detail,
  tone,
}: {
  title: string;
  detail?: string;
  tone: "muted" | "warning";
}) {
  return (
    <div
      className={cn(
        "fixed z-20 left-1/2 -translate-x-1/2",
        "top-[calc(env(safe-area-inset-top)+60px)]",
        "max-w-[calc(100vw-24px)] px-3 py-2",
        "bg-surface-elevated/95 backdrop-blur border border-border rounded-[8px]",
        "text-[13px] leading-5 shadow-[0_8px_30px_rgba(0,0,0,0.25)]",
        tone === "warning" ? "text-warning" : "text-text-secondary",
      )}
    >
      <div className="font-mono-data uppercase text-[10px] leading-4 tracking-wider">
        {title}
      </div>
      {detail ? <div className="mt-0.5 text-text-secondary">{detail}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- toolbar

function Toolbar({
  encoding,
  onEncoding,
  globe,
  onGlobe,
}: {
  encoding: Encoding;
  onEncoding: (e: Encoding) => void;
  globe: boolean;
  onGlobe: (g: boolean) => void;
}) {
  return (
    <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+12px)] z-10 flex items-center gap-2 pointer-events-none">
      <div className="pointer-events-auto flex bg-surface-elevated/95 backdrop-blur border border-border rounded-[8px] overflow-hidden">
        {ENCODINGS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onEncoding(key)}
            className={cn(
              "h-9 px-3 text-[12px] font-mono-data uppercase tracking-wider",
              encoding === key
                ? "bg-accent text-bg"
                : "text-text-secondary active:bg-surface",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => onGlobe(!globe)}
        aria-label={globe ? "Switch to flat map" : "Switch to 3D globe"}
        className={cn(
          "pointer-events-auto h-9 w-9 rounded-[8px] flex items-center justify-center",
          "bg-surface-elevated/95 backdrop-blur border border-border",
          globe ? "text-accent" : "text-text-secondary active:text-text-primary",
        )}
      >
        {globe ? <Globe className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
      </button>
    </div>
  );
}

const ENCODINGS: Array<{ key: Encoding; label: string }> = [
  { key: "default", label: "Default" },
  { key: "year",    label: "Year" },
  { key: "airline", label: "Airline" },
  { key: "type",    label: "Type" },
];

// --------------------------------------------------------------- map layers

async function fetchFlightFeatures(signal: AbortSignal): Promise<GeoJSON.FeatureCollection> {
  const resp = await fetch("/api/flight-map", { cache: "no-store", signal });
  if (!resp.ok) {
    const payload = (await resp.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    if (resp.status === 401) throw new Error("Sign in to load your flights.");
    throw new Error(payload?.message ?? payload?.error ?? `Flight API returned ${resp.status}`);
  }
  return normalizeFeatureCollection(await resp.json());
}

function addFlightLayers(map: maplibregl.Map) {
  // Wide invisible hit area for easy tapping on mobile.
  map.addLayer({
    id: LAYERS.hit,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": "#000",
      "line-width": 20,
      "line-opacity": 0,
    },
  });
  map.addLayer({
    id: LAYERS.glow,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": "#00D4FF",
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        1, 3.0,
        4, 4.5,
        8, 7.0,
        12, 10.0,
      ],
      "line-opacity": [
        "case",
        ["==", ["get", "source"], "adsb"],
        0.24,
        0.16,
      ],
      "line-blur": 2.5,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: LAYERS.greatCircle,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "source"], "great_circle"],
    paint: {
      "line-color": "#00D4FF",
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        1, 1.2,
        4, 1.8,
        8, 2.4,
        12, 3.0,
      ],
      "line-opacity": 0.85,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: LAYERS.adsb,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "source"], "adsb"],
    paint: {
      "line-color": "#00D4FF",
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        1, 1.4,
        4, 2.0,
        8, 3.0,
        12, 4.0,
      ],
      "line-opacity": 0.95,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
}

// ---------------------------------------------------------------- coloring

function buildColorExpression(
  encoding: Encoding,
  data: GeoJSON.FeatureCollection,
): ExpressionSpecification | string {
  if (encoding === "default") return "#00D4FF";

  if (encoding === "year") {
    const years = uniqueValues<number>(data, "year").sort();
    if (years.length === 0) return "#00D4FF";
    if (years.length === 1) return "#00D4FF";
    const [min, max] = [years[0], years[years.length - 1]];
    // Continuous gradient from deep blue (oldest) → amber (newest).
    return [
      "interpolate", ["linear"], ["get", "year"],
      min, "#1976D2",
      (min + max) / 2, "#00D4FF",
      max, "#E8A547",
    ] as ExpressionSpecification;
  }

  const field = encoding === "airline" ? "airline" : "aircraftType";
  const values = uniqueValues<string>(data, field);
  if (values.length === 0) return "#00D4FF";

  const palette = CATEGORICAL_PALETTE;
  const matchExpr: unknown[] = ["match", ["coalesce", ["get", field], "—"]];
  values.forEach((v, i) => {
    matchExpr.push(v ?? "—", palette[i % palette.length]);
  });
  matchExpr.push("#8B9099"); // fallback (null)
  return matchExpr as unknown as ExpressionSpecification;
}

function uniqueValues<T>(data: GeoJSON.FeatureCollection, key: string): T[] {
  const set = new Set<T>();
  for (const f of data.features) {
    const v = f.properties?.[key];
    if (v === undefined || v === null) continue;
    set.add(v as T);
  }
  return Array.from(set);
}

const CATEGORICAL_PALETTE = [
  "#00D4FF", "#4ADE80", "#E8A547", "#A78BFA",
  "#F472B6", "#22D3EE", "#FBBF24", "#FB7185",
  "#34D399", "#60A5FA", "#F59E0B", "#C084FC",
];

// --------------------------------------------------------------- validation

function normalizeFeatureCollection(input: unknown): GeoJSON.FeatureCollection {
  const raw = input as { features?: unknown[] } | null;
  const rawFeatures = Array.isArray(raw?.features) ? raw.features : [];
  const features: GeoJSON.Feature[] = [];

  for (const item of rawFeatures) {
    const feature = item as {
      type?: unknown;
      geometry?: { type?: unknown; coordinates?: unknown };
      properties?: unknown;
    };
    if (feature.type !== "Feature" || feature.geometry?.type !== "LineString") continue;
    if (!Array.isArray(feature.geometry.coordinates)) continue;

    const coords = feature.geometry.coordinates
      .map(toLngLat)
      .filter((coord): coord is [number, number] => coord !== null)
      .filter((coord, index, all) => {
        const prev = all[index - 1];
        return !prev || prev[0] !== coord[0] || prev[1] !== coord[1];
      });

    if (coords.length < 2) continue;

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: isRecord(feature.properties) ? feature.properties : {},
    });
  }

  return { type: "FeatureCollection", features };
}

function toLngLat(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lon, lat];
}

function isRecord(value: unknown): value is GeoJSON.GeoJsonProperties {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBasemapTileError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("tile") || normalized.includes("cartocdn") || normalized.includes("basemaps");
}

// ------------------------------------------------------------------ bounds

function computeBounds(fc: GeoJSON.FeatureCollection): maplibregl.LngLatBoundsLike | null {
  const coords: [number, number][] = [];
  let minLat = Infinity, maxLat = -Infinity;
  for (const feat of fc.features) {
    if (feat.geometry.type !== "LineString") continue;
    for (const [lon, lat] of feat.geometry.coordinates) {
      coords.push([lon, lat]);
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (coords.length === 0) return null;

  const longitudes = coords
    .map(([lon]) => wrapLongitude(lon))
    .sort((a, b) => a - b);
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

  let west = longitudes[(gapStartIndex + 1) % longitudes.length];
  let east = longitudes[gapStartIndex];
  if (east < west) east += 360;

  if (east - west < 0.05) {
    west -= 0.5;
    east += 0.5;
  }
  if (maxLat - minLat < 0.05) {
    minLat -= 0.5;
    maxLat += 0.5;
  }

  return [[west, minLat], [east, maxLat]];
}

function wrapLongitude(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
