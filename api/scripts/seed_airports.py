"""
Seed the `airports` table from OurAirports.com.

Filtering to large_airport + medium_airport keeps the row count around ~10k.
Idempotent: re-running upserts on `icao`.

Usage:
    cd api && uv run python -m scripts.seed_airports [--all]
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import io
from typing import Iterable

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from aloft.db import SessionLocal
from aloft.ids import make_cuid
from aloft.logging import configure_logging, get_logger

configure_logging()
log = get_logger("scripts.seed_airports")

SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"

INTERESTING_TYPES = {"large_airport", "medium_airport"}

UPSERT_SQL = text(
    """
    INSERT INTO airports
      (id, icao, iata, name, "municipality", "isoCountry",
       latitude, longitude, "elevationFt", type)
    VALUES
      (:id, :icao, :iata, :name, :municipality, :iso_country,
       :latitude, :longitude, :elevation_ft, :type)
    ON CONFLICT (icao) DO UPDATE SET
      iata = EXCLUDED.iata,
      name = EXCLUDED.name,
      "municipality" = EXCLUDED."municipality",
      "isoCountry" = EXCLUDED."isoCountry",
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      "elevationFt" = EXCLUDED."elevationFt",
      type = EXCLUDED.type
    """,
)


def _rows(csv_text: str, include_all: bool) -> Iterable[dict[str, object]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        airport_type = row.get("type") or ""
        if not include_all and airport_type not in INTERESTING_TYPES:
            continue
        icao = (row.get("ident") or row.get("gps_code") or "").strip().upper()
        if not icao or len(icao) > 4:
            continue
        try:
            lat = float(row["latitude_deg"])
            lon = float(row["longitude_deg"])
        except (KeyError, TypeError, ValueError):
            continue
        elev_raw = (row.get("elevation_ft") or "").strip()
        elevation_ft: int | None
        try:
            elevation_ft = int(float(elev_raw)) if elev_raw else None
        except ValueError:
            elevation_ft = None
        iata = (row.get("iata_code") or "").strip().upper() or None
        yield {
            "id": make_cuid(),
            "icao": icao,
            "iata": iata,
            "name": (row.get("name") or "").strip(),
            "municipality": (row.get("municipality") or "").strip() or None,
            "iso_country": (row.get("iso_country") or "").strip().upper() or None,
            "latitude": lat,
            "longitude": lon,
            "elevation_ft": elevation_ft,
            "type": airport_type or None,
        }


async def seed(session: AsyncSession, rows: list[dict[str, object]]) -> int:
    count = 0
    batch_size = 500
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        await session.execute(UPSERT_SQL, batch)
        count += len(batch)
        log.info("airports.seed.batch", inserted=count, total=len(rows))
    await session.commit()
    return count


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Include all airport types, not just large+medium.")
    args = parser.parse_args()

    log.info("airports.seed.fetching", url=SOURCE_URL)
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(SOURCE_URL)
        resp.raise_for_status()
        csv_text = resp.text

    rows = list(_rows(csv_text, include_all=args.all))
    log.info("airports.seed.parsed", rows=len(rows))

    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL not configured")
    async with SessionLocal() as session:
        inserted = await seed(session, rows)
    log.info("airports.seed.done", upserted=inserted)


if __name__ == "__main__":
    asyncio.run(main())
