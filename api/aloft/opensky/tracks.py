"""
Track processing — pure functions for downsampling, gap detection, and
great-circle interpolation.

Inputs come from OpenSky's `/tracks/all` endpoint. Each path point arrives as
`[time, latitude, longitude, baro_altitude, true_track, on_ground]` per the
OpenSky REST API spec. We normalise to a list of dicts and run three passes:

1. `clean_points` — drop nulls and out-of-range coords.
2. `downsample`  — stride-based reduction to <= max_points. Track data is
                    already sparse (one observation every few seconds for
                    /tracks/all), so a simple stride beats Douglas-Peucker on
                    perf without losing fidelity at typical zoom levels.
3. `detect_gaps` — any gap > threshold seconds is recorded as a coverage gap.
                    The waypoint array still spans the gap; the renderer is
                    responsible for drawing a dashed segment.

`great_circle` provides a fallback rendering path when ADS-B coverage is fully
absent, or as visual context across known gaps.
"""
from __future__ import annotations

import math
from typing import Any, Iterable, TypedDict


class Waypoint(TypedDict):
    t: int               # epoch seconds
    lat: float
    lon: float
    alt_m: float | None  # barometric altitude in meters
    heading: float | None
    on_ground: bool


class Gap(TypedDict):
    start: int          # epoch seconds (last observation before the gap)
    end: int            # epoch seconds (first observation after the gap)
    duration_s: int


# ---------------------------------------------------------------------------
# Parsing & cleaning
# ---------------------------------------------------------------------------

def parse_opensky_path(path: Iterable[Any]) -> list[Waypoint]:
    """Convert /tracks/all path entries into typed waypoint dicts.

    Each entry is the raw 6-tuple: [t, lat, lon, baro_m, true_track, on_ground].
    """
    out: list[Waypoint] = []
    for entry in path:
        if not entry or len(entry) < 6:
            continue
        t, lat, lon, alt_m, heading, on_ground = entry[:6]
        if t is None or lat is None or lon is None:
            continue
        try:
            lat_f, lon_f = float(lat), float(lon)
        except (TypeError, ValueError):
            continue
        if not (-90.0 <= lat_f <= 90.0) or not (-180.0 <= lon_f <= 180.0):
            continue
        out.append(
            Waypoint(
                t=int(t),
                lat=lat_f,
                lon=lon_f,
                alt_m=float(alt_m) if alt_m is not None else None,
                heading=float(heading) if heading is not None else None,
                on_ground=bool(on_ground),
            )
        )
    return out


# ---------------------------------------------------------------------------
# Downsample
# ---------------------------------------------------------------------------

def downsample(points: list[Waypoint], max_points: int = 500) -> list[Waypoint]:
    """Stride-based downsample preserving first/last and on-ground transitions.

    Anchor points (on_ground flips, large altitude deltas) are always kept so
    departure/arrival rolls render distinctly from cruise.
    """
    if max_points < 2 or len(points) <= max_points:
        return list(points)

    anchors = _anchor_indices(points)
    # Step is sized so a uniform stride alone would yield max_points; we then
    # union in the anchors. Some anchor-dense flights end up slightly above
    # max_points — typically fewer than 5% over, which is fine.
    step = max(1, math.ceil(len(points) / max_points))
    kept_indices = set(range(0, len(points), step)) | anchors | {0, len(points) - 1}
    return [points[i] for i in sorted(kept_indices)]


def _anchor_indices(points: list[Waypoint]) -> set[int]:
    """Indices we never want stride to skip: ground transitions + altitude jumps."""
    anchors: set[int] = set()
    last_ground: bool | None = None
    last_alt: float | None = None
    for i, p in enumerate(points):
        if last_ground is not None and p["on_ground"] != last_ground:
            anchors.add(max(0, i - 1))
            anchors.add(i)
        if last_alt is not None and p["alt_m"] is not None:
            if abs(p["alt_m"] - last_alt) >= 1000.0:  # ~3,300 ft jump
                anchors.add(i)
        last_ground = p["on_ground"]
        if p["alt_m"] is not None:
            last_alt = p["alt_m"]
    return anchors


# ---------------------------------------------------------------------------
# Gap detection
# ---------------------------------------------------------------------------

def detect_gaps(points: list[Waypoint], threshold_s: int = 60) -> list[Gap]:
    """Return any inter-point spans > threshold as gap records.

    Real ADS-B coverage drops are usually multi-minute (oceanic, polar). We
    err on the side of marking shorter gaps too — the UI just renders them
    visually distinct, not as missing flights.
    """
    gaps: list[Gap] = []
    for prev, curr in zip(points, points[1:]):
        delta = curr["t"] - prev["t"]
        if delta > threshold_s:
            gaps.append(Gap(start=prev["t"], end=curr["t"], duration_s=delta))
    return gaps


# ---------------------------------------------------------------------------
# Great-circle interpolation
# ---------------------------------------------------------------------------

def great_circle(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    segments: int = 64,
) -> list[dict[str, float]]:
    """Interpolate a great-circle path between two coords. Useful as the
    fallback geometry when no ADS-B track is available."""
    if segments < 1:
        segments = 1

    phi1, lam1 = math.radians(lat1), math.radians(lon1)
    phi2, lam2 = math.radians(lat2), math.radians(lon2)

    # Spherical law of cosines for distance — fine at the scales we use.
    d = 2 * math.asin(
        math.sqrt(
            math.sin((phi2 - phi1) / 2) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin((lam2 - lam1) / 2) ** 2
        )
    )

    if d == 0.0:
        return [{"lat": lat1, "lon": lon1}]

    pts: list[dict[str, float]] = []
    for i in range(segments + 1):
        f = i / segments
        a = math.sin((1 - f) * d) / math.sin(d)
        b = math.sin(f * d) / math.sin(d)
        x = a * math.cos(phi1) * math.cos(lam1) + b * math.cos(phi2) * math.cos(lam2)
        y = a * math.cos(phi1) * math.sin(lam1) + b * math.cos(phi2) * math.sin(lam2)
        z = a * math.sin(phi1) + b * math.sin(phi2)
        phi = math.atan2(z, math.sqrt(x * x + y * y))
        lam = math.atan2(y, x)
        pts.append({"lat": math.degrees(phi), "lon": math.degrees(lam)})
    return pts


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in km between two coords (mean Earth radius)."""
    r = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def path_distance_km(points: list[Waypoint]) -> float:
    """Sum of segment distances along the waypoint list."""
    total = 0.0
    for prev, curr in zip(points, points[1:]):
        total += haversine_km(prev["lat"], prev["lon"], curr["lat"], curr["lon"])
    return total


def track_overlaps_window(
    points: list[Waypoint],
    first_seen_utc: int,
    last_seen_utc: int,
    tolerance_s: int = 45 * 60,
) -> bool:
    """Return true when waypoint timestamps overlap the resolved flight window.

    OpenSky's /tracks/all can return an adjacent aircraft leg when the query
    time is close to a turn. Do not accept a track that clearly happened
    before or after the resolved flight.
    """
    if not points:
        return False
    track_start = points[0]["t"]
    track_end = points[-1]["t"]
    return not (
        track_end < first_seen_utc - tolerance_s
        or track_start > last_seen_utc + tolerance_s
    )


def track_matches_route(
    points: list[Waypoint],
    dep_lat: float,
    dep_lon: float,
    arr_lat: float,
    arr_lon: float,
    max_endpoint_distance_km: float | None = None,
) -> bool:
    """Return true when a track comes near both booked route endpoints.

    This intentionally errs on the side of rejecting suspicious tracks. A
    correct-but-sparse ADS-B path can fall back to great-circle, but a wrong
    aircraft leg must never be shown as the user's actual flown path.
    """
    if len(points) < 2:
        return False

    route_km = haversine_km(dep_lat, dep_lon, arr_lat, arr_lon)
    tolerance_km = (
        max_endpoint_distance_km
        if max_endpoint_distance_km is not None
        else min(350.0, max(120.0, route_km * 0.22))
    )
    min_dep_km = min(haversine_km(p["lat"], p["lon"], dep_lat, dep_lon) for p in points)
    min_arr_km = min(haversine_km(p["lat"], p["lon"], arr_lat, arr_lon) for p in points)
    return min_dep_km <= tolerance_km and min_arr_km <= tolerance_km
