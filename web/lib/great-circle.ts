/**
 * Great-circle interpolation between two airports.
 *
 * Synthesised paths are used wherever we don't have a real ADS-B trace —
 * the detail map for no_coverage flights, the world map's fallback
 * geometry, etc. The optional perpendicular bow offsets each direction
 * to opposite sides of the true great-circle so that round-trip pairs
 * (VNO→VIE and VIE→VNO) render as two distinct curves instead of
 * overlapping pixel-perfectly. Industry standard (FlightAware,
 * Flightradar24) — visually intuitive at the cost of a small lie about
 * the actual flown path.
 */

export type LatLon = { lat: number; lon: number };

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Spherical linear interpolation along the great circle between two
 * points. Returns `segments + 1` evenly-spaced samples.
 *
 * `bowDeg` bends the line perpendicular to the direction of travel,
 * peaking at the midpoint (sin(π·t) profile) and tapering to zero at
 * the endpoints so the curve still anchors at the airport coordinates.
 * Pass `0` for the pure great-circle.
 */
export function interpolateGreatCircle(
  a: LatLon,
  b: LatLon,
  { segments = 64, bowDeg = 0 }: { segments?: number; bowDeg?: number } = {},
): LatLon[] {
  const phi1 = a.lat * DEG;
  const lam1 = a.lon * DEG;
  const phi2 = b.lat * DEG;
  const lam2 = b.lon * DEG;
  const dphi = phi2 - phi1;
  const dlam = lam2 - lam1;
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  if (d === 0) return [a, b];

  // Constant perpendicular bearing — the bow direction. `+ π/2` is
  // 90° right of the dep→arr heading, so the reverse leg (arr→dep)
  // computes a heading 180° offset and naturally bows to the other
  // side of the great circle.
  const initialBearing = Math.atan2(
    Math.sin(dlam) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlam),
  );
  const perp = initialBearing + Math.PI / 2;
  const cosPerp = Math.cos(perp);
  const sinPerp = Math.sin(perp);

  const out: LatLon[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);
    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    let lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD;
    let lon = Math.atan2(y, x) * RAD;
    if (bowDeg !== 0) {
      const bow = bowDeg * Math.sin(Math.PI * t);
      // Local lat/lon offset along the perpendicular. cos(lat) corrects
      // for longitudinal compression toward the poles; with the small
      // offsets used here (~0.3°) this is plenty accurate.
      lat += bow * cosPerp;
      lon += (bow * sinPerp) / Math.max(0.0001, Math.cos(lat * DEG));
    }
    out.push({ lat, lon });
  }
  return out;
}
