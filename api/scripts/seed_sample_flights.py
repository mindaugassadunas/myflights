"""
Seed ~30 plausible flights for a Vilnius-based business traveler.

This script does NOT make up data — it queries OpenSky for the real flights
that actually departed each airport on each itinerary date, picks one matching
the intended route, and POSTs it to the Next.js /api/flights endpoint so it
runs through the standard resolver + track pipeline.

The resulting rows are real flights that really happened. They're just not
*your* flights. We mark `source='imported'` so they're trivial to wipe later
once you have your actual history.

Prerequisites:
    - FastAPI running on :8000
    - Next.js running on :3011 (or override via NEXT_API_BASE_URL env)
    - DATABASE_URL set
    - OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET set

Usage:
    cd api && uv run python -m scripts.seed_sample_flights
    cd api && uv run python -m scripts.seed_sample_flights --limit 3
    cd api && uv run python -m scripts.seed_sample_flights --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import os
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy import text

from aloft.db import SessionLocal
from aloft.logging import configure_logging, get_logger
from aloft.opensky.client import OpenSkyClient

configure_logging()
log = get_logger("scripts.seed_sample_flights")

NEXT_API = os.environ.get("NEXT_API_BASE_URL", "http://localhost:3011")
TIMEOUT = httpx.Timeout(60.0, connect=10.0)

# (days_ago, dep_iata, arr_iata, dep_icao, arr_icao)
# Plausible Vilnius-based business-traveler itinerary across the past 3 months.
ITINERARY: list[tuple[int, str, str, str, str]] = [
    # Long-haul trip to NYC via AMS
    (86, "VNO", "AMS", "EYVI", "EHAM"),
    (86, "AMS", "JFK", "EHAM", "KJFK"),
    (79, "JFK", "AMS", "KJFK", "EHAM"),
    (79, "AMS", "VNO", "EHAM", "EYVI"),
    # Stockholm trip
    (75, "VNO", "ARN", "EYVI", "ESSA"),
    (72, "ARN", "VNO", "ESSA", "EYVI"),
    # Berlin trip
    (68, "VNO", "BER", "EYVI", "EDDB"),
    (66, "BER", "VNO", "EDDB", "EYVI"),
    # Helsinki day-trip
    (60, "VNO", "HEL", "EYVI", "EFHK"),
    (59, "HEL", "VNO", "EFHK", "EYVI"),
    # London via AMS
    (52, "VNO", "AMS", "EYVI", "EHAM"),
    (52, "AMS", "LHR", "EHAM", "EGLL"),
    (49, "LHR", "AMS", "EGLL", "EHAM"),
    (49, "AMS", "VNO", "EHAM", "EYVI"),
    # Dubai via Copenhagen
    (42, "VNO", "CPH", "EYVI", "EKCH"),
    (42, "CPH", "DXB", "EKCH", "OMDB"),
    (39, "DXB", "CPH", "OMDB", "EKCH"),
    (39, "CPH", "VNO", "EKCH", "EYVI"),
    # Riga short return
    (35, "VNO", "RIX", "EYVI", "EVRA"),
    (34, "RIX", "VNO", "EVRA", "EYVI"),
    # Frankfurt
    (28, "VNO", "FRA", "EYVI", "EDDF"),
    (27, "FRA", "VNO", "EDDF", "EYVI"),
    # Warsaw
    (21, "VNO", "WAW", "EYVI", "EPWA"),
    (19, "WAW", "VNO", "EPWA", "EYVI"),
    # Paris via AMS
    (14, "VNO", "AMS", "EYVI", "EHAM"),
    (14, "AMS", "CDG", "EHAM", "LFPG"),
    (11, "CDG", "AMS", "LFPG", "EHAM"),
    (11, "AMS", "VNO", "EHAM", "EYVI"),
    # Recent extras
    (7, "VNO", "AMS", "EYVI", "EHAM"),
    (5, "VNO", "FRA", "EYVI", "EDDF"),
]


async def find_real_flight(
    client: OpenSkyClient,
    dep_icao: str,
    arr_icao: str,
    flight_date: date,
) -> dict | None:
    """Return the best /flights/departure match for the route on this date.

    "Best" = a flight whose `estArrivalAirport` matches `arr_icao` and whose
    callsign starts with a 3-letter airline ICAO prefix (the canonical shape
    for commercial flights — filters out private/military oddities).
    """
    begin = int(
        datetime(flight_date.year, flight_date.month, flight_date.day, tzinfo=timezone.utc).timestamp()
    )
    end = begin + 86400
    try:
        flights = await client.flights_departure(dep_icao, begin, end)
    except Exception as exc:
        log.warning("opensky.lookup.failed", dep=dep_icao, error=repr(exc)[:200])
        return None
    if not flights:
        return None

    arr = arr_icao.upper()
    matches = [f for f in flights if (f.get("estArrivalAirport") or "").upper() == arr]
    if not matches:
        return None

    def score(f: dict) -> tuple[int, str]:
        cs = (f.get("callsign") or "").strip()
        is_commercial = 1 if len(cs) >= 4 and cs[:3].isalpha() and cs[:3].isupper() else 0
        return (is_commercial, cs)

    matches.sort(key=score, reverse=True)
    return matches[0]


async def post_flight(
    http: httpx.AsyncClient,
    dep_iata: str,
    arr_iata: str,
    callsign: str,
    flight_date: str,
) -> httpx.Response:
    return await http.post(
        f"{NEXT_API}/api/flights",
        json={
            "date": flight_date,
            "depAirport": dep_iata,
            "arrAirport": arr_iata,
            "callsign": callsign,
        },
    )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=30, help="Max flights to seed.")
    parser.add_argument("--dry-run", action="store_true", help="Find candidates but don't POST.")
    parser.add_argument("--start", type=int, default=0, help="Skip the first N itinerary entries.")
    args = parser.parse_args()

    today = date.today()
    targets = ITINERARY[args.start : args.start + args.limit]
    log.info("seed.start", count=len(targets), next_api=NEXT_API, today=str(today))

    created_ids: list[str] = []

    async with (
        OpenSkyClient() as os_client,
        httpx.AsyncClient(timeout=TIMEOUT) as http,
    ):
        for i, (days_ago, dep_iata, arr_iata, dep_icao, arr_icao) in enumerate(targets, start=1):
            flight_date = today - timedelta(days=days_ago)
            log.info("seed.leg", i=i, total=len(targets), date=str(flight_date),
                     route=f"{dep_iata}->{arr_iata}")

            match = await find_real_flight(os_client, dep_icao, arr_icao, flight_date)
            if not match:
                log.warning("seed.no_match", dep=dep_iata, arr=arr_iata, date=str(flight_date))
                continue
            callsign = (match.get("callsign") or "").strip()
            log.info("seed.candidate", callsign=callsign, icao24=match.get("icao24"))

            if args.dry_run:
                continue

            try:
                resp = await post_flight(http, dep_iata, arr_iata, callsign, str(flight_date))
            except Exception as exc:
                log.error("seed.post_failed", error=repr(exc)[:200])
                continue

            if resp.status_code not in (200, 201):
                log.error("seed.http_failed", status=resp.status_code, body=resp.text[:300])
                continue
            data = resp.json()
            log.info(
                "seed.created",
                id=data.get("id"),
                status=data.get("resolutionStatus"),
                distance_km=round(data.get("distanceKm") or 0, 1),
                duration_min=data.get("durationMin"),
            )
            created_ids.append(data["id"])

    # Mark seeded rows so they're easy to wipe later.
    if created_ids and SessionLocal is not None:
        async with SessionLocal() as session:
            await session.execute(
                text('UPDATE flights SET source = \'imported\' WHERE id = ANY(:ids)'),
                {"ids": created_ids},
            )
            await session.commit()
        log.info("seed.tagged_imported", count=len(created_ids))

    log.info("seed.done", created=len(created_ids), attempted=len(targets))


if __name__ == "__main__":
    asyncio.run(main())
