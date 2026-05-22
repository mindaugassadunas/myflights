"""
Pydantic request/response models for the FastAPI surface.

These are intentionally separate from the SQLAlchemy ORM models (aloft.models).
The ORM is the storage shape; this module is the wire shape — Next.js sees
these and only these.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

class ResolveCallsignRequest(BaseModel):
    callsign: str = Field(..., min_length=2, max_length=10)
    date: date
    dep_airport: str | None = Field(default=None, description="IATA or ICAO")
    arr_airport: str | None = Field(default=None, description="IATA or ICAO")


class ResolveSmartRequest(BaseModel):
    """
    Smart resolver — used when the user has an IATA flight number (BT961)
    but the airline recodes its callsigns. The web layer turns IATA into
    ICAO via the airlines table before calling this.
    """
    airline_icao: str = Field(..., min_length=3, max_length=3, description="Airline ICAO code")
    flight_digits: str | None = Field(default=None, description="Trailing digits from the flight number")
    date: date
    dep_airport: str = Field(..., description="IATA or ICAO")
    arr_airport: str | None = Field(default=None, description="IATA or ICAO")


class ResolveTailRequest(BaseModel):
    registration: str = Field(..., min_length=2, max_length=12)
    date: date


class ResolutionResponse(BaseModel):
    icao24: str
    callsign: str | None
    first_seen_utc: datetime
    last_seen_utc: datetime
    dep_airport_icao: str | None
    arr_airport_icao: str | None
    candidates: int


class ResolutionErrorResponse(BaseModel):
    reason: str
    detail: str | None = None


# ---------------------------------------------------------------------------
# Schedule lookup
# ---------------------------------------------------------------------------

class ScheduleLookupRequest(BaseModel):
    flight_number: str = Field(..., min_length=3, max_length=10, description="IATA flight number, e.g. KL1772")
    date: date


class ScheduleLookupResponse(BaseModel):
    flight_number: str
    callsign: str | None
    airline_iata: str | None
    airline_icao: str | None
    dep_airport_icao: str | None
    dep_airport_iata: str | None
    arr_airport_icao: str | None
    arr_airport_iata: str | None
    aircraft_model: str | None
    aircraft_registration: str | None
    scheduled_dep_utc: datetime | None
    scheduled_arr_utc: datetime | None


# ---------------------------------------------------------------------------
# Tracks
# ---------------------------------------------------------------------------

class TrackResponse(BaseModel):
    flight_id: str
    icao24: str
    point_count: int
    distance_km: float
    duration_min: int
    waypoints: list[dict[str, Any]]
    gaps: list[dict[str, Any]]
    great_circle: list[dict[str, float]]
    fetched_at: datetime
