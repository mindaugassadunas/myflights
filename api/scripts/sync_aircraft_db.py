"""
Monthly sync of the OpenSky aircraft database into `aircraft`.

Source: https://opensky-network.org/datasets/metadata/aircraftDatabase.csv

This is a CSV with ~600k rows. We stream the response and upsert in batches
keyed on `icao24`. Designed to run as a Railway cron job, but the script is
also safe to run by hand.

Usage:
    cd api && uv run python -m scripts.sync_aircraft_db
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
log = get_logger("scripts.sync_aircraft_db")

SOURCE_URL = "https://opensky-network.org/datasets/metadata/aircraftDatabase.csv"
BATCH_SIZE = 1000

UPSERT_SQL = text(
    """
    INSERT INTO aircraft
      (id, icao24, registration, "typeCode", model, operator, "operatorIcao", "yearBuilt", "updatedAt")
    VALUES
      (:id, :icao24, :registration, :type_code, :model, :operator, :operator_icao, :year_built, NOW())
    ON CONFLICT (icao24) DO UPDATE SET
      registration = EXCLUDED.registration,
      "typeCode" = EXCLUDED."typeCode",
      model = EXCLUDED.model,
      operator = EXCLUDED.operator,
      "operatorIcao" = EXCLUDED."operatorIcao",
      "yearBuilt" = EXCLUDED."yearBuilt",
      "updatedAt" = NOW()
    """,
)


def _parse_year(value: str) -> int | None:
    value = (value or "").strip()
    if not value:
        return None
    # OpenSky stores either "1998" or "1998-04-01" or full ISO date.
    try:
        return int(value[:4])
    except ValueError:
        return None


def _bounded(value: str | None, max_len: int) -> str | None:
    """OpenSky's CSV occasionally has malformed entries longer than the
    spec-defined width. Trim to the column's declared limit rather than
    fail the whole batch."""
    if value is None:
        return None
    s = value.strip()
    if not s:
        return None
    return s[:max_len]


def _rows(text_payload: str) -> Iterable[dict[str, object]]:
    reader = csv.DictReader(io.StringIO(text_payload))
    for row in reader:
        icao24 = (row.get("icao24") or "").strip().lower()
        if not icao24 or len(icao24) != 6:
            continue
        type_code_raw = (row.get("typecode") or row.get("icao_aircraft_type") or "").strip().upper()
        operator_icao_raw = (row.get("operatoricao") or "").strip().upper()
        yield {
            "id": make_cuid(),
            "icao24": icao24,
            "registration": _bounded(row.get("registration"), 32),
            "type_code": _bounded(type_code_raw, 4),
            "model": _bounded(row.get("model"), 128),
            "operator": _bounded(row.get("operator") or row.get("owner"), 128),
            "operator_icao": _bounded(operator_icao_raw, 3),
            "year_built": _parse_year(row.get("built") or row.get("registered") or ""),
        }


async def main() -> None:
    log.info("aircraft_db.sync.fetching", url=SOURCE_URL)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(300.0, connect=10.0),
        follow_redirects=True,
    ) as client:
        resp = await client.get(SOURCE_URL)
        resp.raise_for_status()
        body = resp.text

    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL not configured")

    batch: list[dict[str, object]] = []
    total = 0
    async with SessionLocal() as session:
        for row in _rows(body):
            batch.append(row)
            if len(batch) >= BATCH_SIZE:
                await session.execute(UPSERT_SQL, batch)
                total += len(batch)
                if total % 10_000 == 0:
                    log.info("aircraft_db.sync.progress", upserted=total)
                batch.clear()
        if batch:
            await session.execute(UPSERT_SQL, batch)
            total += len(batch)
        await session.commit()
    log.info("aircraft_db.sync.done", upserted=total)


if __name__ == "__main__":
    asyncio.run(main())
