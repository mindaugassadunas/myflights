"""
Resolution pipeline: identifier + date -> icao24 + time window.

Two entry points:
    resolve_callsign(callsign, date_utc, dep_icao?, arr_icao?)
    resolve_tail(registration, date_utc)

Both return a `ResolutionResult` on success or raise `ResolutionError` with a
machine-readable reason. The caller (FastAPI route or background worker) is
responsible for persisting the outcome to the `flights` row.

OpenSky's `/flights/*` endpoints partition by UTC calendar day. We use a 24h
window centred on the requested date (00:00 UTC start, +24h end) plus a 6h
slop on each side to catch flights that cross midnight UTC. That can cost two
day-partitions on the OpenSky bill — see CLAUDE.md §3.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aloft.logging import get_logger
from aloft.models import Aircraft
from aloft.opensky.client import OpenSkyClient

log = get_logger("aloft.opensky.resolver")

# OpenSky's /flights/* endpoints accept at most 2 day-partitions (UTC) per
# request. We query the user-supplied date as a single 24h UTC window — if
# the flight straddles midnight UTC in the user's mind, they retry with
# date ± 1.



ResolutionReason = Literal[
    "no_match",
    "no_airport",
    "no_airline",
    "no_registration",
    "ambiguous",
    "opensky_error",
    "invalid_input",
]


class ResolutionError(Exception):
    def __init__(self, reason: ResolutionReason, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason
        self.detail = detail


@dataclass(frozen=True)
class ResolutionResult:
    icao24: str
    callsign: str | None
    first_seen_utc: datetime
    last_seen_utc: datetime
    dep_airport_icao: str | None
    arr_airport_icao: str | None
    candidates: int


def _day_window(d: date) -> tuple[int, int]:
    start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return int(start.timestamp()), int(end.timestamp())


def _normalise_callsign(cs: str) -> str:
    return (cs or "").strip().upper()


def _epoch_to_utc(seconds: int | float | None) -> datetime:
    if seconds is None:
        # Should never happen for matched flights but be defensive.
        return datetime.now(timezone.utc)
    return datetime.fromtimestamp(float(seconds), tz=timezone.utc)


# ---------------------------------------------------------------------------
# Callsign + date -> icao24
# ---------------------------------------------------------------------------

async def resolve_callsign(
    callsign: str,
    flight_date: date,
    dep_icao: str | None,
    arr_icao: str | None,
    *,
    client: OpenSkyClient,
) -> ResolutionResult:
    cs = _normalise_callsign(callsign)
    if not cs:
        raise ResolutionError("invalid_input", "empty callsign")
    if not dep_icao and not arr_icao:
        raise ResolutionError(
            "invalid_input",
            "callsign resolution needs a departure or arrival airport",
        )

    begin, end = _day_window(flight_date)
    try:
        if dep_icao:
            entries = await client.flights_departure(dep_icao.upper(), begin, end)
        else:
            assert arr_icao is not None
            entries = await client.flights_arrival(arr_icao.upper(), begin, end)
    except Exception as exc:  # httpx errors bubble up here
        raise ResolutionError("opensky_error", repr(exc)) from exc

    candidates = [
        entry for entry in (entries or [])
        if _normalise_callsign(entry.get("callsign", "")) == cs
    ]

    # If both airports were provided, narrow further by the other end.
    if dep_icao and arr_icao:
        candidates = [
            c for c in candidates
            if (c.get("estArrivalAirport") or "").upper() == arr_icao.upper()
        ] or candidates  # fall back to broader set if no exact arrival match

    if not candidates:
        raise ResolutionError("no_match", f"no flights matched callsign={cs}")

    if len(candidates) > 1:
        # Prefer the one whose firstSeen is closest to noon UTC of the date —
        # heuristic to deduplicate repeating-codeshare callsigns.
        noon = datetime(
            flight_date.year, flight_date.month, flight_date.day, 12, tzinfo=timezone.utc
        ).timestamp()
        candidates.sort(key=lambda c: abs(float(c.get("firstSeen") or 0) - noon))
        log.info(
            "resolver.callsign.ambiguous",
            callsign=cs,
            count=len(candidates),
            chose_first_seen=candidates[0].get("firstSeen"),
        )

    pick = candidates[0]
    return ResolutionResult(
        icao24=str(pick["icao24"]).lower(),
        callsign=cs,
        first_seen_utc=_epoch_to_utc(pick.get("firstSeen")),
        last_seen_utc=_epoch_to_utc(pick.get("lastSeen")),
        dep_airport_icao=(pick.get("estDepartureAirport") or None),
        arr_airport_icao=(pick.get("estArrivalAirport") or None),
        candidates=len(candidates),
    )


# ---------------------------------------------------------------------------
# IATA flight number + route -> icao24
#
# Many airlines (airBaltic, Lufthansa Group, KLM, BA on some routes) recode
# their callsigns into 3-letter alphanumerics for ATC distinguishability —
# `BT961` flies as `BTI98T`, `LH892` flies as `DLH3KH`. The user only ever
# sees the IATA flight number on their ticket, so we need a smart matcher
# that takes (airline_icao, digits?, route) and finds the actual airframe.
#
# Algorithm:
#   1. /flights/departure for dep airport on the day
#   2. Filter to callsigns starting with airline_icao
#   3. If arr_airport given, narrow to flights actually landing there
#   4. If digits given, prefer callsigns that literally contain those digits
#      (catches non-recoded flights like KLM1057)
#   5. Best candidate wins; ties broken by recoded-shape (longer alphanumeric
#      suffix → more likely recoded → more likely a real assignment).
# ---------------------------------------------------------------------------


async def resolve_smart(
    airline_icao: str,
    flight_digits: str | None,
    flight_date: date,
    dep_icao: str,
    arr_icao: str | None,
    *,
    client: OpenSkyClient,
) -> ResolutionResult:
    airline = (airline_icao or "").strip().upper()
    if not airline or len(airline) != 3:
        raise ResolutionError("invalid_input", f"airline ICAO must be 3 letters, got {airline_icao!r}")
    if not dep_icao:
        raise ResolutionError("invalid_input", "smart resolution needs a departure airport")

    begin, end = _day_window(flight_date)
    try:
        entries = await client.flights_departure(dep_icao.upper(), begin, end)
    except Exception as exc:
        raise ResolutionError("opensky_error", repr(exc)) from exc

    if not entries:
        raise ResolutionError("no_match", f"no departures from {dep_icao} on {flight_date}")

    by_airline = [
        e for e in entries
        if _normalise_callsign(e.get("callsign", "")).startswith(airline)
    ]
    if not by_airline:
        raise ResolutionError(
            "no_match",
            f"no {airline} departures from {dep_icao} on {flight_date}",
        )

    candidates = by_airline
    if arr_icao:
        # Strict arrival filter, but tolerate flights where OpenSky didn't
        # tag the arrival (estArrivalAirport == null) — they could still
        # match the intended route, but a flight tagged with a *different*
        # arrival is a confident mismatch.
        candidates = [
            c for c in candidates
            if (c.get("estArrivalAirport") or "").upper() in {arr_icao.upper(), ""}
        ]
        if not candidates:
            raise ResolutionError(
                "no_match",
                f"no {airline} departures from {dep_icao} → {arr_icao} on {flight_date}",
            )

    if flight_digits:
        digits = flight_digits.lstrip("0") or "0"
        with_digits = [
            c for c in candidates
            if digits in _normalise_callsign(c.get("callsign", ""))
        ]
        if with_digits:
            candidates = with_digits

    if not candidates:
        raise ResolutionError("no_match", "no flights matched the smart filter")

    if len(candidates) > 1:
        # Tie-break: prefer the longer suffix after the airline prefix
        # (recoded callsigns are typically 6-7 chars, plain digit-only ones
        # are sometimes shorter and ambiguous across many days).
        candidates.sort(
            key=lambda c: -(len(_normalise_callsign(c.get("callsign", ""))) - len(airline))
        )
        log.info(
            "resolver.smart.ambiguous",
            airline=airline,
            count=len(candidates),
            pick=_normalise_callsign(candidates[0].get("callsign") or ""),
        )

    pick = candidates[0]
    return ResolutionResult(
        icao24=str(pick["icao24"]).lower(),
        callsign=_normalise_callsign(pick.get("callsign") or ""),
        first_seen_utc=_epoch_to_utc(pick.get("firstSeen")),
        last_seen_utc=_epoch_to_utc(pick.get("lastSeen")),
        dep_airport_icao=(pick.get("estDepartureAirport") or None),
        arr_airport_icao=(pick.get("estArrivalAirport") or None),
        candidates=len(candidates),
    )


# ---------------------------------------------------------------------------
# Registration + date -> icao24
# ---------------------------------------------------------------------------

async def resolve_tail(
    registration: str,
    flight_date: date,
    *,
    session: AsyncSession,
    client: OpenSkyClient,
) -> ResolutionResult:
    reg = (registration or "").strip().upper()
    if not reg:
        raise ResolutionError("invalid_input", "empty registration")

    stmt = select(Aircraft).where(Aircraft.registration == reg).limit(1)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise ResolutionError("no_registration", f"registration {reg} not in aircraft DB")
    icao24 = row.icao24

    begin, end = _day_window(flight_date)
    try:
        entries = await client.flights_aircraft(icao24, begin, end)
    except Exception as exc:
        raise ResolutionError("opensky_error", repr(exc)) from exc

    # /flights/aircraft can return multiple legs across the window if the
    # plane flew several segments. We pick the leg whose firstSeen is closest
    # to noon UTC of the requested date.
    if not entries:
        raise ResolutionError("no_match", f"no flights for icao24={icao24} on {flight_date}")

    noon = datetime(
        flight_date.year, flight_date.month, flight_date.day, 12, tzinfo=timezone.utc
    ).timestamp()
    entries_sorted = sorted(entries, key=lambda c: abs(float(c.get("firstSeen") or 0) - noon))
    pick = entries_sorted[0]

    return ResolutionResult(
        icao24=icao24,
        callsign=_normalise_callsign(pick.get("callsign") or ""),
        first_seen_utc=_epoch_to_utc(pick.get("firstSeen")),
        last_seen_utc=_epoch_to_utc(pick.get("lastSeen")),
        dep_airport_icao=pick.get("estDepartureAirport") or None,
        arr_airport_icao=pick.get("estArrivalAirport") or None,
        candidates=len(entries),
    )


# ---------------------------------------------------------------------------
# Public helper for routes / scripts
# ---------------------------------------------------------------------------

def to_dict(result: ResolutionResult) -> dict[str, Any]:
    return {
        "icao24": result.icao24,
        "callsign": result.callsign,
        "first_seen_utc": result.first_seen_utc.isoformat(),
        "last_seen_utc": result.last_seen_utc.isoformat(),
        "dep_airport_icao": result.dep_airport_icao,
        "arr_airport_icao": result.arr_airport_icao,
        "candidates": result.candidates,
    }
