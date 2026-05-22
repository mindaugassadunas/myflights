"""
SQLAlchemy ORM models mirroring web/prisma/schema.prisma.

Prisma is the single source of truth for schema. Prisma generates camelCase,
double-quoted column names (e.g. `"isoCountry"`) — we declare each mapped
column with its exact DB name so SQLAlchemy queries the right identifier.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Airport(Base):
    __tablename__ = "airports"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    icao: Mapped[str | None] = mapped_column(String(4), index=True, unique=True)
    iata: Mapped[str | None] = mapped_column(String(3), index=True)
    name: Mapped[str] = mapped_column(String)
    municipality: Mapped[str | None] = mapped_column(String)
    iso_country: Mapped[str | None] = mapped_column("isoCountry", String(2), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    elevation_ft: Mapped[int | None] = mapped_column("elevationFt", Integer)
    type: Mapped[str | None] = mapped_column(String)


class Airline(Base):
    __tablename__ = "airlines"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    icao: Mapped[str | None] = mapped_column(String(3), index=True, unique=True)
    iata: Mapped[str | None] = mapped_column(String(2), index=True)
    name: Mapped[str] = mapped_column(String)
    callsign: Mapped[str | None] = mapped_column(String)
    country: Mapped[str | None] = mapped_column(String)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AircraftType(Base):
    __tablename__ = "aircraft_types"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    icao_code: Mapped[str] = mapped_column("icaoCode", String(4), index=True, unique=True)
    manufacturer: Mapped[str | None] = mapped_column(String)
    model: Mapped[str] = mapped_column(String)
    seats_typical: Mapped[int | None] = mapped_column("seatsTypical", Integer)
    fuel_burn_per_hour_kg: Mapped[float | None] = mapped_column("fuelBurnPerHourKg", Float)


class Aircraft(Base):
    __tablename__ = "aircraft"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    icao24: Mapped[str] = mapped_column(String(6), index=True, unique=True)
    registration: Mapped[str | None] = mapped_column(String, index=True)
    type_code: Mapped[str | None] = mapped_column("typeCode", String(4), index=True)
    model: Mapped[str | None] = mapped_column(String)
    operator: Mapped[str | None] = mapped_column(String)
    operator_icao: Mapped[str | None] = mapped_column("operatorIcao", String(3))
    year_built: Mapped[int | None] = mapped_column("yearBuilt", Integer)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime(timezone=True))


class Flight(Base):
    __tablename__ = "flights"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column("userId", String, index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    callsign: Mapped[str | None] = mapped_column(String, index=True)
    registration: Mapped[str | None] = mapped_column(String)
    icao24: Mapped[str | None] = mapped_column(String(6), index=True)
    dep_airport_id: Mapped[str] = mapped_column(
        "depAirportId", String, ForeignKey("airports.id")
    )
    arr_airport_id: Mapped[str] = mapped_column(
        "arrAirportId", String, ForeignKey("airports.id")
    )
    airline_id: Mapped[str | None] = mapped_column(
        "airlineId", String, ForeignKey("airlines.id")
    )
    aircraft_type_id: Mapped[str | None] = mapped_column(
        "aircraftTypeId", String, ForeignKey("aircraft_types.id")
    )
    aircraft_id: Mapped[str | None] = mapped_column(
        "aircraftId", String, ForeignKey("aircraft.id")
    )
    trip_id: Mapped[str | None] = mapped_column("tripId", String)

    seat: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)

    first_seen_utc: Mapped[datetime | None] = mapped_column("firstSeenUtc", DateTime(timezone=True))
    last_seen_utc: Mapped[datetime | None] = mapped_column("lastSeenUtc", DateTime(timezone=True))
    distance_km: Mapped[float | None] = mapped_column("distanceKm", Float)
    duration_min: Mapped[int | None] = mapped_column("durationMin", Integer)
    co2_kg: Mapped[float | None] = mapped_column("co2Kg", Float)

    resolution_status: Mapped[str] = mapped_column("resolutionStatus", String, default="pending", index=True)
    resolution_error: Mapped[str | None] = mapped_column("resolutionError", Text)
    resolution_attempts: Mapped[int] = mapped_column("resolutionAttempts", Integer, default=0)
    resolved_at: Mapped[datetime | None] = mapped_column("resolvedAt", DateTime(timezone=True))

    source: Mapped[str] = mapped_column(String, default="manual")
    source_email_id: Mapped[str | None] = mapped_column("sourceEmailId", String, index=True)

    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime(timezone=True))


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    flight_id: Mapped[str] = mapped_column(
        "flightId", String, ForeignKey("flights.id"), unique=True, index=True
    )
    waypoints: Mapped[dict[str, Any]] = mapped_column(JSONB)
    gaps: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    great_circle: Mapped[dict[str, Any] | None] = mapped_column("greatCircle", JSONB)
    source: Mapped[str] = mapped_column(String, default="opensky")
    point_count: Mapped[int] = mapped_column("pointCount", Integer, default=0)
    fetched_at: Mapped[datetime] = mapped_column("fetchedAt", DateTime(timezone=True))

    flight: Mapped[Flight] = relationship()


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column("userId", String, index=True)
    label: Mapped[str | None] = mapped_column(String)
    start_utc: Mapped[datetime] = mapped_column("startUtc", DateTime(timezone=True), index=True)
    end_utc: Mapped[datetime] = mapped_column("endUtc", DateTime(timezone=True))
    home_airport: Mapped[str | None] = mapped_column("homeAirport", String)
    auto_generated: Mapped[bool] = mapped_column("autoGenerated", Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True))


class EmailImport(Base):
    __tablename__ = "email_imports"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column("userId", String, index=True)
    message_id: Mapped[str] = mapped_column("messageId", String, unique=True, index=True)
    thread_id: Mapped[str | None] = mapped_column("threadId", String)
    subject: Mapped[str | None] = mapped_column(String)
    from_addr: Mapped[str | None] = mapped_column("fromAddr", String)
    received_at: Mapped[datetime | None] = mapped_column("receivedAt", DateTime(timezone=True))
    parsed_flights_count: Mapped[int] = mapped_column("parsedFlightsCount", Integer, default=0)
    confidence: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="parsed")
    raw_excerpt: Mapped[str | None] = mapped_column("rawExcerpt", Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True))


class OpenSkyCredit(Base):
    __tablename__ = "opensky_credits"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    day: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    endpoint: Mapped[str] = mapped_column(String)
    credits: Mapped[int] = mapped_column(Integer)
    request_id: Mapped[str | None] = mapped_column("requestId", String)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True))
