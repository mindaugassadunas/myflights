"""
Leg locator: given (icao24, time window, dep_icao, arr_icao), find the
specific leg of that airframe's rotation that flew the booked route.

`/tracks/all`'s `time` parameter is unreliable when an aircraft does
multiple legs in a day — the endpoint can hand back a different rotation
even for a query inside the right window. By first asking OpenSky "what
legs did this airframe fly", we pin down the matching leg's firstSeen and
lastSeen, then use *those* bounds to drive the `/tracks/all` query and the
geometry validator.

The `/flights/aircraft` endpoint partitions by UTC day. We query a window
around the resolver's `firstSeenUtc` hint that's wide enough to catch
flights crossing UTC midnight. Per CLAUDE.md §3 this can cost two
day-partitions per call — budgeted, idempotent, cacheable per (icao24,
date).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from aloft.logging import get_logger
from aloft.opensky.client import OpenSkyClient

log = get_logger("aloft.opensky.legs")


LegOutcome = Literal["match", "wrong_route", "no_operations", "opensky_error"]


@dataclass(frozen=True)
class LegMatch:
    first_seen_utc: int          # epoch seconds
    last_seen_utc: int           # epoch seconds
    callsign: str | None
    dep_airport_icao: str | None
    arr_airport_icao: str | None


@dataclass(frozen=True)
class LegLookup:
    outcome: LegOutcome
    leg: LegMatch | None = None
    detail: str = ""
    # Compact summary of every leg returned, for diagnostic resolution errors.
    legs_found: tuple[tuple[str | None, str | None, int], ...] = field(default_factory=tuple)


def _window(first_seen_utc: int, last_seen_utc: int | None) -> tuple[int, int]:
    """Snap to a 2-UTC-day window starting at the day of firstSeen.

    OpenSky's `/flights/aircraft` rejects queries spanning more than 2
    day-partitions (HTTP 400, body: "You can only query across 2
    partitions (days)..."), so a symmetric pad isn't safe — a noon flight
    padded ±12h would span 3 calendar days.

    Aligning to [day_start, day_start + 48h] keeps the cost at 2
    day-partitions and still catches legs whose lastSeen runs past UTC
    midnight. The one case missed is a leg whose firstSeen is *before*
    midnight of the resolver's hint day; in practice the resolver's
    firstSeen is OpenSky's own firstSeen for the leg, so the start
    aligns.
    """
    fs_dt = datetime.fromtimestamp(first_seen_utc, tz=timezone.utc)
    day_start = datetime(fs_dt.year, fs_dt.month, fs_dt.day, tzinfo=timezone.utc)
    return int(day_start.timestamp()), int((day_start + timedelta(days=2)).timestamp())


async def locate_leg(
    icao24: str,
    first_seen_hint_utc: int,
    last_seen_hint_utc: int | None,
    dep_icao: str | None,
    arr_icao: str | None,
    *,
    client: OpenSkyClient,
) -> LegLookup:
    """Return the leg of `icao24`'s rotation that flew `dep_icao` → `arr_icao`.

    `first_seen_hint_utc` is the resolver's best guess; the lookup centres
    its query window on it. When multiple legs match the route (rare —
    same aircraft, same route, same day), we tie-break by proximity to the
    hint.
    """
    icao24_lc = (icao24 or "").lower().strip()
    if not icao24_lc:
        return LegLookup(outcome="opensky_error", detail="empty icao24")

    begin, end = _window(first_seen_hint_utc, last_seen_hint_utc)
    try:
        entries = await client.flights_aircraft(icao24_lc, begin, end)
    except Exception as exc:
        return LegLookup(outcome="opensky_error", detail=repr(exc)[:200])

    legs = list(entries or [])
    if not legs:
        return LegLookup(
            outcome="no_operations",
            detail=f"OpenSky has no recorded operations for icao24={icao24_lc} in this window",
        )

    legs_summary = tuple(
        (
            (e.get("estDepartureAirport") or None),
            (e.get("estArrivalAirport") or None),
            int(e.get("firstSeen") or 0),
        )
        for e in legs
    )

    dep_u = dep_icao.upper() if dep_icao else None
    arr_u = arr_icao.upper() if arr_icao else None

    def _matches(entry: dict[str, Any]) -> bool:
        e_dep = (entry.get("estDepartureAirport") or "").upper()
        e_arr = (entry.get("estArrivalAirport") or "").upper()
        # Strict on whichever side we know. OpenSky's ground-position
        # association can leave one end null when receiver coverage near
        # the airport is patchy — accept null, reject a confidently-wrong
        # tag.
        dep_ok = dep_u is None or e_dep == "" or e_dep == dep_u
        arr_ok = arr_u is None or e_arr == "" or e_arr == arr_u
        return dep_ok and arr_ok

    matching = [e for e in legs if _matches(e)]
    if not matching:
        flown = ", ".join(
            f"{(dep or '?')}→{(arr or '?')}" for dep, arr, _ in legs_summary
        )
        return LegLookup(
            outcome="wrong_route",
            legs_found=legs_summary,
            detail=(
                f"icao24={icao24_lc} did not fly "
                f"{(dep_u or '?')}→{(arr_u or '?')} in this window — "
                f"legs found: {flown}"
            ),
        )

    if len(matching) > 1:
        matching.sort(
            key=lambda e: abs(int(e.get("firstSeen") or 0) - first_seen_hint_utc)
        )
        log.info(
            "legs.locate.ambiguous",
            icao24=icao24_lc,
            count=len(matching),
            picked_first_seen=int(matching[0].get("firstSeen") or 0),
        )

    pick = matching[0]
    leg = LegMatch(
        first_seen_utc=int(pick.get("firstSeen") or 0),
        last_seen_utc=int(pick.get("lastSeen") or 0),
        callsign=(pick.get("callsign") or "").strip() or None,
        dep_airport_icao=(pick.get("estDepartureAirport") or None),
        arr_airport_icao=(pick.get("estArrivalAirport") or None),
    )
    log.info(
        "legs.locate.match",
        icao24=icao24_lc,
        first_seen=leg.first_seen_utc,
        last_seen=leg.last_seen_utc,
        dep=leg.dep_airport_icao,
        arr=leg.arr_airport_icao,
    )
    return LegLookup(outcome="match", leg=leg, legs_found=legs_summary)
