"""
AeroDataBox client — schedule lookup by flight number + date.

Used by the add-flight flow so the user only needs to enter the flight
number; the route, airline, aircraft, and scheduled times are pulled
from AeroDataBox. Falls back to manual entry on the web side if the
lookup returns nothing.

Endpoint: GET /flights/number/{flightNumber}/{date}
Docs:     https://rapidapi.com/aedbx-aedbx/api/aerodatabox
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from aloft.config import get_settings
from aloft.logging import get_logger

log = get_logger("aloft.schedule.aerodatabox")


class ScheduleLookupError(Exception):
    """Raised when AeroDataBox can't resolve a flight."""

    def __init__(self, reason: str, detail: str | None = None) -> None:
        super().__init__(f"{reason}: {detail}" if detail else reason)
        self.reason = reason
        self.detail = detail


@dataclass(frozen=True)
class ScheduleLookupResult:
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


async def lookup(flight_number: str, date: str) -> ScheduleLookupResult:
    """Resolve a flight number + date to its scheduled route.

    `flight_number` is the IATA flight number ("KL1772", "BT961"). `date`
    is YYYY-MM-DD. Returns the first matching leg; raises
    ScheduleLookupError on no match, configuration issues, or upstream
    errors.
    """
    settings = get_settings()
    if not settings.aerodatabox_api_key:
        raise ScheduleLookupError(
            "not_configured",
            "AERODATABOX_API_KEY is not set",
        )

    cleaned = flight_number.strip().upper().replace(" ", "")
    if not cleaned:
        raise ScheduleLookupError("invalid_input", "empty flight number")

    url = f"https://{settings.aerodatabox_host}/flights/number/{cleaned}/{date}"
    headers = {
        "X-RapidAPI-Key": settings.aerodatabox_api_key,
        "X-RapidAPI-Host": settings.aerodatabox_host,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as err:
        log.warning("aerodatabox.network_error", error=str(err))
        raise ScheduleLookupError("upstream_error", str(err)) from err

    if resp.status_code == 204 or resp.status_code == 404:
        raise ScheduleLookupError("not_found", f"no schedule for {cleaned} on {date}")
    if resp.status_code == 401 or resp.status_code == 403:
        log.warning("aerodatabox.auth_error", status=resp.status_code, body=resp.text[:300])
        raise ScheduleLookupError("auth_error", f"aerodatabox auth failed ({resp.status_code})")
    if resp.status_code == 429:
        raise ScheduleLookupError("rate_limited", "aerodatabox quota exhausted")
    if resp.status_code == 400:
        # AeroDataBox's Basic plan rejects dates outside ~the last 365 days
        # with a 400 and a human-readable message. Surface that distinctly
        # so the UI can tell the user to enter the route manually instead
        # of showing a generic upstream error.
        body = resp.text or ""
        lowered = body.lower()
        if "earlier than" in lowered or "later than" in lowered or "365 day" in lowered:
            raise ScheduleLookupError(
                "out_of_range",
                "AeroDataBox's plan doesn't cover this date — only the last ~365 days.",
            )
        log.warning("aerodatabox.bad_request", body=body[:300])
        raise ScheduleLookupError("upstream_error", f"bad request: {body[:200]}")
    if resp.status_code >= 400:
        log.warning("aerodatabox.error", status=resp.status_code, body=resp.text[:300])
        raise ScheduleLookupError("upstream_error", f"status {resp.status_code}")

    try:
        payload = resp.json()
    except ValueError as err:
        raise ScheduleLookupError("upstream_error", "non-JSON response") from err

    items: list[dict[str, Any]]
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict) and isinstance(payload.get("flights"), list):
        items = payload["flights"]
    else:
        items = []

    if not items:
        raise ScheduleLookupError("not_found", f"no schedule for {cleaned} on {date}")

    # Prefer the first item whose departure scheduled date matches the
    # requested date — guards against API quirks where adjacent days slip
    # into the response.
    chosen = _pick_match(items, date) or items[0]
    return _parse(chosen, cleaned)


def _pick_match(items: list[dict[str, Any]], date: str) -> dict[str, Any] | None:
    for item in items:
        dep = item.get("departure") or {}
        sched = (dep.get("scheduledTime") or {}).get("utc")
        if isinstance(sched, str) and sched.startswith(date):
            return item
    return None


def _parse(item: dict[str, Any], requested_number: str) -> ScheduleLookupResult:
    departure = item.get("departure") or {}
    arrival = item.get("arrival") or {}
    dep_airport = departure.get("airport") or {}
    arr_airport = arrival.get("airport") or {}
    aircraft = item.get("aircraft") or {}
    airline = item.get("airline") or {}

    return ScheduleLookupResult(
        flight_number=_str(item.get("number")) or requested_number,
        callsign=_clean_callsign(item.get("callSign")),
        airline_iata=_str(airline.get("iata")),
        airline_icao=_str(airline.get("icao")),
        dep_airport_icao=_str(dep_airport.get("icao")),
        dep_airport_iata=_str(dep_airport.get("iata")),
        arr_airport_icao=_str(arr_airport.get("icao")),
        arr_airport_iata=_str(arr_airport.get("iata")),
        aircraft_model=_str(aircraft.get("model")),
        aircraft_registration=_str(aircraft.get("reg")),
        scheduled_dep_utc=_parse_utc((departure.get("scheduledTime") or {}).get("utc")),
        scheduled_arr_utc=_parse_utc((arrival.get("scheduledTime") or {}).get("utc")),
    )


def _str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _clean_callsign(v: Any) -> str | None:
    s = _str(v)
    if not s:
        return None
    return s.replace(" ", "").upper()


def _parse_utc(value: Any) -> datetime | None:
    """AeroDataBox returns timestamps like '2026-04-13 14:30Z' — not ISO 8601."""
    s = _str(value)
    if not s:
        return None
    # Normalise "YYYY-MM-DD HH:MMZ" → "YYYY-MM-DDTHH:MM:00+00:00"
    candidate = s.replace(" ", "T")
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
