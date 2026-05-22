import "server-only";
import type { Flight, Airport, Track, Airline, AircraftType } from "@prisma/client";
import { interpolateGreatCircle } from "@/lib/great-circle";

// Match the detail-page bow so both surfaces render identically for the
// same flight.
const WORLD_MAP_BOW_DEG = 0.3;

/**
 * Convert flights + their tracks into a GeoJSON FeatureCollection of
 * LineStrings ready to drop into a MapLibre source. The geometry source
 * priority is:
 *
 *   1. Track.waypoints (real ADS-B data)
 *   2. Track.greatCircle (fallback geometry stored at resolve-time)
 *   3. Synthesised great-circle from airport coords (last resort)
 *
 * `source` on the feature tells the renderer which style to apply (solid
 * line for ADS-B, dashed for great-circle).
 */

export type Waypoint = {
  t: number;
  lat: number;
  lon: number;
  alt_m: number | null;
  heading: number | null;
  on_ground: boolean;
};

export type GreatCirclePoint = { lat: number; lon: number };

type FlightForGeo = Flight & {
  depAirport: Airport;
  arrAirport: Airport;
  track: Track | null;
  airline: Airline | null;
  aircraftType: AircraftType | null;
};

export type FlightFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: {
    flightId: string;
    callsign: string | null;
    dep: string | null;
    arr: string | null;
    date: string;
    year: number;
    status: string;
    source: "adsb" | "great_circle";
    airline: string | null;       // ICAO code, e.g. "KLM"
    aircraftType: string | null;  // ICAO type code, e.g. "E190"
  };
};

export function flightsToFeatureCollection(flights: FlightForGeo[]): {
  type: "FeatureCollection";
  features: FlightFeature[];
} {
  const features: FlightFeature[] = [];
  for (const f of flights) {
    const geom = pickGeometry(f);
    if (!geom) continue;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: geom.coords },
      properties: {
        flightId: f.id,
        callsign: f.callsign,
        dep: f.depAirport.iata ?? f.depAirport.icao,
        arr: f.arrAirport.iata ?? f.arrAirport.icao,
        date: f.date.toISOString().slice(0, 10),
        year: f.date.getUTCFullYear(),
        status: f.resolutionStatus,
        source: geom.source,
        airline: f.airline?.icao ?? null,
        aircraftType: f.aircraftType?.icaoCode ?? null,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

function pickGeometry(
  f: FlightForGeo,
): { coords: [number, number][]; source: "adsb" | "great_circle" } | null {
  const wps = (f.track?.waypoints ?? null) as Waypoint[] | null;
  if (Array.isArray(wps) && wps.length >= 2) {
    return {
      coords: wps.map((w) => [w.lon, w.lat]),
      source: "adsb",
    };
  }
  const gc = (f.track?.greatCircle ?? null) as GreatCirclePoint[] | null;
  if (Array.isArray(gc) && gc.length >= 2) {
    return {
      coords: gc.map((p) => [p.lon, p.lat]),
      source: "great_circle",
    };
  }
  // Last resort: synthesise a bowed great circle between the two
  // airports so a round-trip pair (VNO→VIE + VIE→VNO) renders as two
  // distinct curves rather than overlapping pixel-perfectly.
  if (f.depAirport && f.arrAirport) {
    const points = interpolateGreatCircle(
      { lat: f.depAirport.latitude, lon: f.depAirport.longitude },
      { lat: f.arrAirport.latitude, lon: f.arrAirport.longitude },
      { bowDeg: WORLD_MAP_BOW_DEG },
    );
    return {
      coords: points.map((p): [number, number] => [p.lon, p.lat]),
      source: "great_circle",
    };
  }
  return null;
}

/**
 * Per-flight waypoint geometry as a LineString with `altitudeM` properties
 * on each coordinate (used by the detail-page map for the altitude
 * gradient).
 */
export function flightWaypointsToFeature(track: Track | null): {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: { altitudes: (number | null)[] };
} | null {
  const wps = (track?.waypoints ?? null) as Waypoint[] | null;
  if (!Array.isArray(wps) || wps.length < 2) return null;
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: wps.map((w) => [w.lon, w.lat]),
    },
    properties: {
      altitudes: wps.map((w) => w.alt_m ?? null),
    },
  };
}

export function bbox(features: FlightFeature[]): [number, number, number, number] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  let hasAny = false;
  for (const f of features) {
    for (const [lon, lat] of f.geometry.coordinates) {
      hasAny = true;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return hasAny ? [minLon, minLat, maxLon, maxLat] : null;
}
