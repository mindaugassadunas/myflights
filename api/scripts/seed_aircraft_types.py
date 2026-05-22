"""
Seed `aircraft_types` with a curated list of commercial types and their fuel
burn / typical seat counts.

Fuel burn figures are kg/hour at typical cruise (long-range commercial flights).
Sources: OpenAP, manufacturer specs, Cirium operational data — these are
ballpark numbers for CO₂ estimation, not engineering values.

Usage:
    cd api && uv run python -m scripts.seed_aircraft_types
"""
from __future__ import annotations

import asyncio

from sqlalchemy import text

from aloft.db import SessionLocal
from aloft.ids import make_cuid
from aloft.logging import configure_logging, get_logger

configure_logging()
log = get_logger("scripts.seed_aircraft_types")


# (icao_code, manufacturer, model, seats_typical, fuel_burn_per_hour_kg)
TYPES: list[tuple[str, str, str, int, float]] = [
    # Airbus narrow-body
    ("A319", "Airbus",  "A319-100",       144,  2300.0),
    ("A320", "Airbus",  "A320-200",       180,  2400.0),
    ("A20N", "Airbus",  "A320neo",        186,  2050.0),
    ("A321", "Airbus",  "A321-200",       220,  2700.0),
    ("A21N", "Airbus",  "A321neo",        232,  2350.0),
    # Airbus wide-body
    ("A332", "Airbus",  "A330-200",       250,  5700.0),
    ("A333", "Airbus",  "A330-300",       290,  6000.0),
    ("A339", "Airbus",  "A330-900neo",    287,  5300.0),
    ("A359", "Airbus",  "A350-900",       315,  5800.0),
    ("A35K", "Airbus",  "A350-1000",      369,  6400.0),
    ("A388", "Airbus",  "A380-800",       525, 11000.0),
    # Boeing narrow-body
    ("B737", "Boeing",  "737-700",        128,  2200.0),
    ("B738", "Boeing",  "737-800",        162,  2500.0),
    ("B739", "Boeing",  "737-900ER",      178,  2600.0),
    ("B38M", "Boeing",  "737 MAX 8",      178,  2200.0),
    ("B39M", "Boeing",  "737 MAX 9",      193,  2300.0),
    # Boeing wide-body
    ("B752", "Boeing",  "757-200",        200,  3500.0),
    ("B762", "Boeing",  "767-200",        216,  4800.0),
    ("B763", "Boeing",  "767-300",        261,  5100.0),
    ("B772", "Boeing",  "777-200",        314,  7400.0),
    ("B77L", "Boeing",  "777-200LR",      317,  7100.0),
    ("B77W", "Boeing",  "777-300ER",      396,  7400.0),
    ("B788", "Boeing",  "787-8",          242,  5400.0),
    ("B789", "Boeing",  "787-9",          290,  5700.0),
    ("B78X", "Boeing",  "787-10",         330,  5900.0),
    # Regional
    ("E190", "Embraer", "E190",            96,  1400.0),
    ("E195", "Embraer", "E195",           116,  1500.0),
    ("E290", "Embraer", "E190-E2",        106,  1100.0),
    ("E295", "Embraer", "E195-E2",        132,  1200.0),
    ("AT76", "ATR",     "ATR 72-600",      72,   620.0),
    ("DH8D", "Bombardier", "Dash 8 Q400",  78,   860.0),
    ("CRJ9", "Bombardier", "CRJ-900",      90,  1200.0),
]

UPSERT_SQL = text(
    """
    INSERT INTO aircraft_types
      (id, "icaoCode", manufacturer, model, "seatsTypical", "fuelBurnPerHourKg")
    VALUES
      (:id, :icao_code, :manufacturer, :model, :seats_typical, :fuel_burn_per_hour_kg)
    ON CONFLICT ("icaoCode") DO UPDATE SET
      manufacturer = EXCLUDED.manufacturer,
      model = EXCLUDED.model,
      "seatsTypical" = EXCLUDED."seatsTypical",
      "fuelBurnPerHourKg" = EXCLUDED."fuelBurnPerHourKg"
    """,
)


async def main() -> None:
    rows = [
        {
            "id": make_cuid(),
            "icao_code": code,
            "manufacturer": mfr,
            "model": model,
            "seats_typical": seats,
            "fuel_burn_per_hour_kg": burn,
        }
        for (code, mfr, model, seats, burn) in TYPES
    ]
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL not configured")
    async with SessionLocal() as session:
        await session.execute(UPSERT_SQL, rows)
        await session.commit()
    log.info("aircraft_types.seed.done", upserted=len(rows))


if __name__ == "__main__":
    asyncio.run(main())
