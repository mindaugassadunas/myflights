"""
GET /tracks/{flight_id} — fetch the ADS-B track for a stored flight.

Pipeline:
    1. Load the flight row (must have icao24 + firstSeenUtc).
    2. Call OpenSky /tracks/all.
    3. Parse, downsample, detect gaps, compute great-circle.
    4. Upsert into the `tracks` table.
    5. Return the processed track to the caller.

The endpoint is idempotent: re-running overwrites the stored track.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from aloft.db import get_session
from aloft.ids import make_cuid
from aloft.logging import get_logger
from aloft.models import Airport, Flight
from aloft.opensky.client import OpenSkyClient
from aloft.opensky.legs import LegMatch, locate_leg
from aloft.opensky.tracks import (
    detect_gaps,
    downsample,
    great_circle,
    parse_opensky_path,
    path_distance_km,
    track_matches_route,
    track_overlaps_window,
)
from aloft.schemas import TrackResponse
from aloft.security import require_internal_key

log = get_logger("aloft.routes.tracks")
router = APIRouter(prefix="/tracks", tags=["tracks"], dependencies=[Depends(require_internal_key)])


_UPSERT_TRACK_SQL = text(
    """
    INSERT INTO tracks
      (id, "flightId", waypoints, gaps, "greatCircle", source, "pointCount", "fetchedAt")
    VALUES
      (:id, :flight_id, CAST(:waypoints AS jsonb), CAST(:gaps AS jsonb),
       CAST(:great_circle AS jsonb), :source, :point_count, NOW())
    ON CONFLICT ("flightId") DO UPDATE SET
      waypoints = EXCLUDED.waypoints,
      gaps = EXCLUDED.gaps,
      "greatCircle" = EXCLUDED."greatCircle",
      "pointCount" = EXCLUDED."pointCount",
      "fetchedAt" = NOW()
    """,
)

_UPDATE_FLIGHT_SQL = text(
    """
    UPDATE flights
       SET "distanceKm" = :distance_km,
           "durationMin" = :duration_min,
           "resolutionStatus" = 'resolved',
           "resolutionError" = NULL,
           "resolvedAt" = NOW(),
           "updatedAt" = NOW()
     WHERE id = :flight_id
    """,
)

_UPDATE_FLIGHT_NO_TRACK_SQL = text(
    """
    UPDATE flights
       SET "resolutionStatus" = 'no_coverage',
           "resolutionError" = :resolution_error,
           "updatedAt" = NOW()
     WHERE id = :flight_id
    """,
)


@router.get(
    "/{flight_id}",
    response_model=TrackResponse,
    responses={404: {"description": "Flight not found or not yet resolved"}},
)
async def get_track(
    flight_id: str,
    session: AsyncSession = Depends(get_session),
) -> TrackResponse:
    flight = (
        await session.execute(select(Flight).where(Flight.id == flight_id))
    ).scalar_one_or_none()
    if flight is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="flight not found")
    if not flight.icao24 or flight.first_seen_utc is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="flight has not been resolved yet (missing icao24 or firstSeenUtc)",
        )

    dep_icao, dep = await _airport_pick(session, flight.dep_airport_id)
    arr_icao, arr = await _airport_pick(session, flight.arr_airport_id)

    raw = None
    cleaned = []
    invalid_reason = "OpenSky track unavailable"
    async with OpenSkyClient() as client:
        # Step 1: pin down the exact leg the airframe flew. /tracks/all's
        # `time` param is unreliable when the plane did several legs that
        # day — even a query inside our window can return a different
        # rotation. /flights/aircraft tells us authoritatively what this
        # airframe did and lets us reject mis-resolved flights early
        # without wasting /tracks/all calls.
        lookup = await locate_leg(
            flight.icao24,
            int(flight.first_seen_utc.timestamp()),
            int(flight.last_seen_utc.timestamp()) if flight.last_seen_utc else None,
            dep_icao,
            arr_icao,
            client=client,
        )

        if lookup.outcome == "opensky_error":
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"OpenSky error during leg lookup: {lookup.detail}",
            )

        if lookup.outcome != "match" or lookup.leg is None:
            # Definitive: OpenSky knows this airframe but says it didn't
            # fly this route in this window. No point hitting /tracks/all.
            invalid_reason = lookup.detail
            log.warning(
                "tracks.fetch.no_matching_leg",
                flight_id=flight_id,
                icao24=flight.icao24,
                outcome=lookup.outcome,
                detail=lookup.detail,
                legs_found=lookup.legs_found,
            )
        else:
            leg: LegMatch = lookup.leg
            for track_time in _track_query_times(leg.first_seen_utc, leg.last_seen_utc):
                try:
                    candidate_raw = await client.tracks_all(flight.icao24, time=track_time)
                except Exception as exc:
                    # /tracks/all is unreliable for older flights (OpenSky's
                    # track cache rotates aggressively). Try another in-leg
                    # timestamp before giving up.
                    invalid_reason = f"OpenSky track unavailable: {repr(exc)[:160]}"
                    log.info(
                        "tracks.fetch.no_track",
                        flight_id=flight_id,
                        icao24=flight.icao24,
                        track_time=track_time,
                        error=repr(exc)[:200],
                    )
                    continue

                candidate = (
                    parse_opensky_path(candidate_raw["path"])
                    if candidate_raw and candidate_raw.get("path")
                    else []
                )
                valid, reason = _valid_track_for_bounds(
                    candidate, leg.first_seen_utc, leg.last_seen_utc, dep, arr,
                )
                if valid:
                    raw = candidate_raw
                    cleaned = candidate
                    invalid_reason = ""
                    break

                invalid_reason = reason
                log.warning(
                    "tracks.fetch.rejected",
                    flight_id=flight_id,
                    icao24=flight.icao24,
                    track_time=track_time,
                    reason=reason,
                    points=len(candidate),
                )

    downsampled = downsample(cleaned, max_points=500) if cleaned else []
    gaps = detect_gaps(cleaned, threshold_s=60) if cleaned else []
    distance_km = path_distance_km(cleaned) if cleaned else 0.0

    # Build great-circle from the actual flight endpoints if we know them,
    # otherwise from the first/last observed waypoint. The great-circle is
    # the fallback geometry when /tracks/all is empty.
    if dep and arr:
        gc = great_circle(dep[0], dep[1], arr[0], arr[1], segments=64)
    elif downsampled:
        first, last = downsampled[0], downsampled[-1]
        gc = great_circle(first["lat"], first["lon"], last["lat"], last["lon"], segments=64)
    else:
        gc = []

    if cleaned:
        duration_min = max(0, int((cleaned[-1]["t"] - cleaned[0]["t"]) / 60))
        # Track-derived distance overrides the great-circle estimate the web
        # layer set at resolution time.
        flight_distance_km: float | None = distance_km
        flight_duration_min: int | None = duration_min
    else:
        duration_min = 0
        flight_distance_km = None
        flight_duration_min = None

    fetched_at = datetime.now(timezone.utc)
    await session.execute(
        _UPSERT_TRACK_SQL,
        {
            "id": make_cuid(),
            "flight_id": flight_id,
            "waypoints": _json(downsampled),
            "gaps": _json(gaps),
            "great_circle": _json(gc),
            "source": "opensky",
            "point_count": len(downsampled),
        },
    )
    # Only overwrite flight.distance_km / duration_min when we actually
    # observed a track. Otherwise the great-circle values set at resolution
    # time stand.
    if flight_distance_km is not None:
        await session.execute(
            _UPDATE_FLIGHT_SQL,
            {
                "flight_id": flight_id,
                "distance_km": flight_distance_km,
                "duration_min": flight_duration_min,
            },
        )
    else:
        await session.execute(
            _UPDATE_FLIGHT_NO_TRACK_SQL,
            {
                "flight_id": flight_id,
                "resolution_error": invalid_reason[:1000],
            },
        )
    await session.commit()

    log.info(
        "tracks.fetch.ok",
        flight_id=flight_id,
        icao24=flight.icao24,
        points=len(downsampled),
        gaps=len(gaps),
        distance_km=round(distance_km, 1),
        duration_min=duration_min,
    )

    return TrackResponse(
        flight_id=flight_id,
        icao24=flight.icao24,
        point_count=len(downsampled),
        distance_km=flight_distance_km if flight_distance_km is not None else (flight.distance_km or 0.0),
        duration_min=flight_duration_min if flight_duration_min is not None else (flight.duration_min or 0),
        waypoints=list(downsampled),
        gaps=list(gaps),
        great_circle=gc,
        fetched_at=fetched_at,
    )


def _track_query_times(first_seen: int, last_seen: int) -> list[int]:
    if last_seen <= first_seen:
        return [first_seen]

    # Query inside the flight window, not exactly at firstSeen. At turns,
    # OpenSky can hand back the previous leg for an aircraft if the query
    # lands near an on-ground boundary.
    duration = last_seen - first_seen
    candidates = [
        first_seen + duration // 2,
        min(last_seen - 1, first_seen + min(15 * 60, max(60, duration // 4))),
        max(first_seen, last_seen - min(15 * 60, max(60, duration // 4))),
    ]
    out: list[int] = []
    for ts in candidates:
        if ts not in out:
            out.append(ts)
    return out


def _valid_track_for_bounds(
    points: list[dict],
    first_seen: int,
    last_seen: int,
    dep: tuple[float, float] | None,
    arr: tuple[float, float] | None,
) -> tuple[bool, str]:
    if not points:
        return False, "OpenSky returned no track points"

    if not track_overlaps_window(points, first_seen, last_seen):
        return False, "OpenSky returned an adjacent aircraft leg outside the flight time window"

    if dep and arr and not track_matches_route(points, dep[0], dep[1], arr[0], arr[1]):
        return False, "OpenSky returned a track that does not match the booked route"

    return True, ""


async def _airport_pick(
    session: AsyncSession, airport_id: str | None
) -> tuple[str | None, tuple[float, float] | None]:
    """Return (icao_code, (lat, lon)) for an airport row. Either may be None."""
    if not airport_id:
        return None, None
    row = (
        await session.execute(select(Airport).where(Airport.id == airport_id))
    ).scalar_one_or_none()
    if row is None:
        return None, None
    return (row.icao or None), (row.latitude, row.longitude)


def _json(value: object) -> str:
    import json
    return json.dumps(value, separators=(",", ":"))
