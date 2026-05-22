"""
POST /schedule/lookup — { flight_number, date } -> scheduled route

Wraps AeroDataBox. Used by the add-flight UI so the user can enter just a
flight number + date and get the route auto-resolved. Stateless — the
caller (Next.js) writes nothing here; it uses the result to populate the
flight form before submitting.
"""
from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status

from aloft.logging import get_logger
from aloft.schedule.aerodatabox import ScheduleLookupError, lookup
from aloft.schemas import ScheduleLookupRequest, ScheduleLookupResponse
from aloft.security import require_internal_key

log = get_logger("aloft.routes.schedule")
router = APIRouter(
    prefix="/schedule",
    tags=["schedule"],
    dependencies=[Depends(require_internal_key)],
)


_REASON_TO_STATUS = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "invalid_input": status.HTTP_400_BAD_REQUEST,
    "out_of_range": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "not_configured": status.HTTP_503_SERVICE_UNAVAILABLE,
    "auth_error": status.HTTP_502_BAD_GATEWAY,
    "rate_limited": status.HTTP_429_TOO_MANY_REQUESTS,
    "upstream_error": status.HTTP_502_BAD_GATEWAY,
}


@router.post("/lookup", response_model=ScheduleLookupResponse)
async def post_schedule_lookup(body: ScheduleLookupRequest) -> ScheduleLookupResponse:
    try:
        result = await lookup(body.flight_number, body.date.isoformat())
    except ScheduleLookupError as err:
        raise HTTPException(
            status_code=_REASON_TO_STATUS.get(err.reason, 500),
            detail={"reason": err.reason, "detail": err.detail},
        ) from err

    log.info(
        "schedule.lookup.ok",
        flight_number=result.flight_number,
        dep=result.dep_airport_icao or result.dep_airport_iata,
        arr=result.arr_airport_icao or result.arr_airport_iata,
    )
    return ScheduleLookupResponse(**asdict(result))
