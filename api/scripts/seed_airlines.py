"""
Seed `airlines` from OpenFlights.

Source: https://github.com/jpatokal/openflights — `airlines.dat` is a CSV-ish
file with columns: id, name, alias, iata, icao, callsign, country, active.

Usage:
    cd api && uv run python -m scripts.seed_airlines
"""
from __future__ import annotations

import asyncio
import csv
import io
from typing import Iterable

import httpx
from sqlalchemy import text

from aloft.db import SessionLocal
from aloft.ids import make_cuid
from aloft.logging import configure_logging, get_logger

configure_logging()
log = get_logger("scripts.seed_airlines")

SOURCE_URL = (
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat"
)

UPSERT_SQL = text(
    """
    INSERT INTO airlines (id, icao, iata, name, callsign, country, active)
    VALUES (:id, :icao, :iata, :name, :callsign, :country, :active)
    ON CONFLICT (icao) DO UPDATE SET
      iata = EXCLUDED.iata,
      name = EXCLUDED.name,
      callsign = EXCLUDED.callsign,
      country = EXCLUDED.country,
      active = EXCLUDED.active
    """,
)


def _rows(text_payload: str) -> Iterable[dict[str, object]]:
    reader = csv.reader(io.StringIO(text_payload))
    for row in reader:
        if len(row) < 8:
            continue
        _, name, _alias, iata, icao, callsign, country, active = row[:8]
        icao = (icao or "").strip().upper()
        # OpenFlights uses "\\N" or empty for nulls.
        if not icao or icao in {"\\N", "N/A"} or len(icao) != 3:
            continue
        yield {
            "id": make_cuid(),
            "icao": icao,
            "iata": (iata or "").strip().upper() or None,
            "name": (name or "").strip(),
            "callsign": (callsign or "").strip() or None,
            "country": (country or "").strip() or None,
            "active": (active or "").strip().upper() == "Y",
        }


async def main() -> None:
    log.info("airlines.seed.fetching", url=SOURCE_URL)
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(SOURCE_URL)
        resp.raise_for_status()
        body = resp.text

    rows = list(_rows(body))
    log.info("airlines.seed.parsed", rows=len(rows))

    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL not configured")
    async with SessionLocal() as session:
        for start in range(0, len(rows), 500):
            batch = rows[start : start + 500]
            await session.execute(UPSERT_SQL, batch)
        await session.commit()
    log.info("airlines.seed.done", upserted=len(rows))


if __name__ == "__main__":
    asyncio.run(main())
