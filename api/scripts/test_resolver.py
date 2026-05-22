"""
Phase 2 smoke test: resolve a known recent flight against the live OpenSky API.

Defaults to a known-busy short-haul: KLM 1772 VNO → AMS. Override via flags.

Usage:
    cd api && uv run python -m scripts.test_resolver
    cd api && uv run python -m scripts.test_resolver --callsign DLH892 --dep EDDF --date 2024-04-14
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import date, timedelta

from aloft.db import SessionLocal
from aloft.logging import configure_logging, get_logger
from aloft.opensky.airports import find_airport
from aloft.opensky.client import OpenSkyClient
from aloft.opensky.resolver import ResolutionError, resolve_callsign, to_dict

configure_logging()
log = get_logger("scripts.test_resolver")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--callsign", default="KLM1772")
    parser.add_argument("--dep", default="EYVI", help="departure airport (IATA or ICAO)")
    parser.add_argument("--arr", default="EHAM")
    parser.add_argument("--date", default=str((date.today() - timedelta(days=2))))
    args = parser.parse_args()

    flight_date = date.fromisoformat(args.date)

    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL not configured")

    async with SessionLocal() as session:
        dep = await find_airport(session, args.dep) if args.dep else None
        arr = await find_airport(session, args.arr) if args.arr else None
        dep_icao = dep.icao if dep else None
        arr_icao = arr.icao if arr else None

        log.info(
            "resolver.smoke.start",
            callsign=args.callsign,
            dep=dep_icao,
            arr=arr_icao,
            date=str(flight_date),
        )

        async with OpenSkyClient() as client:
            try:
                result = await resolve_callsign(
                    args.callsign, flight_date, dep_icao, arr_icao, client=client,
                )
            except ResolutionError as err:
                log.error("resolver.smoke.failed", reason=err.reason, detail=err.detail)
                return

        log.info("resolver.smoke.ok", **to_dict(result))


if __name__ == "__main__":
    asyncio.run(main())
