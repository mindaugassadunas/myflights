"""
Airport lookup helpers.

OpenSky's /flights/departure and /flights/arrival endpoints key on ICAO (4-char)
airport codes. Users typically remember IATA (3-char). This module resolves
whichever the caller has into a canonical row.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aloft.models import Airport


@dataclass(frozen=True)
class AirportRef:
    id: str
    icao: str | None
    iata: str | None
    name: str
    latitude: float
    longitude: float
    iso_country: str | None


async def find_airport(session: AsyncSession, code: str) -> AirportRef | None:
    """Resolve an IATA (3) or ICAO (4) code to an airport row.

    Codes are upper-cased and trimmed. Returns None if no match. We prefer
    exact ICAO matches over IATA when both could apply (3-letter inputs hit
    IATA only; 4-letter inputs hit ICAO only).
    """
    if not code:
        return None
    c = code.strip().upper()
    if len(c) == 4:
        stmt = select(Airport).where(Airport.icao == c)
    elif len(c) == 3:
        stmt = select(Airport).where(Airport.iata == c)
    else:
        # Ambiguous — try either column.
        stmt = select(Airport).where(or_(Airport.icao == c, Airport.iata == c))
    row = (await session.execute(stmt.limit(1))).scalar_one_or_none()
    if row is None:
        return None
    return AirportRef(
        id=row.id,
        icao=row.icao,
        iata=row.iata,
        name=row.name,
        latitude=row.latitude,
        longitude=row.longitude,
        iso_country=row.iso_country,
    )
