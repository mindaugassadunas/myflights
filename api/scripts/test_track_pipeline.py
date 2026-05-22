"""
Phase 2 end-to-end smoke test: resolve a callsign, fetch its track, run it
through downsample + gap detection, report.

This skips the DB write step (the /tracks/{flight_id} HTTP route does that —
which requires an inserted Flight row, a Phase 3 concern). Same processing
pipeline, just without persistence.

Usage:
    cd api && uv run python -m scripts.test_track_pipeline \\
        --callsign KLM43E --dep EHAM --arr EGNM --date 2026-05-15
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import date

from aloft.db import SessionLocal
from aloft.logging import configure_logging, get_logger
from aloft.opensky.airports import find_airport
from aloft.opensky.client import OpenSkyClient
from aloft.opensky.resolver import resolve_callsign
from aloft.opensky.tracks import (
    detect_gaps,
    downsample,
    great_circle,
    parse_opensky_path,
    path_distance_km,
)

configure_logging()
log = get_logger("scripts.test_track_pipeline")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--callsign", required=True)
    parser.add_argument("--dep", default=None)
    parser.add_argument("--arr", default=None)
    parser.add_argument("--date", required=True)
    args = parser.parse_args()

    flight_date = date.fromisoformat(args.date)

    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL not configured")

    async with SessionLocal() as session:
        dep = await find_airport(session, args.dep) if args.dep else None
        arr = await find_airport(session, args.arr) if args.arr else None
        dep_icao = dep.icao if dep else None
        arr_icao = arr.icao if arr else None

        async with OpenSkyClient() as client:
            resolved = await resolve_callsign(
                args.callsign, flight_date, dep_icao, arr_icao, client=client,
            )
            log.info(
                "pipeline.resolved",
                icao24=resolved.icao24,
                first_seen=resolved.first_seen_utc.isoformat(),
                last_seen=resolved.last_seen_utc.isoformat(),
            )

            raw_track = await client.tracks_all(
                resolved.icao24, time=int(resolved.first_seen_utc.timestamp()),
            )

    if not raw_track or not raw_track.get("path"):
        log.error("pipeline.no_track")
        return

    cleaned = parse_opensky_path(raw_track["path"])
    downsampled = downsample(cleaned, max_points=500)
    gaps = detect_gaps(cleaned, threshold_s=60)
    distance_km = path_distance_km(cleaned)

    gc = []
    if dep and arr:
        gc = great_circle(dep.latitude, dep.longitude, arr.latitude, arr.longitude, segments=32)

    log.info(
        "pipeline.processed",
        raw_points=len(raw_track["path"]),
        cleaned_points=len(cleaned),
        downsampled_points=len(downsampled),
        gaps=len(gaps),
        longest_gap_s=max((g["duration_s"] for g in gaps), default=0),
        distance_km=round(distance_km, 1),
        great_circle_points=len(gc),
    )


if __name__ == "__main__":
    asyncio.run(main())
