"""
POST /resolve/callsign  — { callsign, date, dep_airport?, arr_airport? } -> icao24
POST /resolve/tail      — { registration, date } -> icao24

Both endpoints are stateless: they hit OpenSky and return the resolution
without touching the flights table. The caller (Next.js add-flight route or
the background worker) writes the result onto the row.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aloft.db import get_session
from aloft.logging import get_logger
from aloft.opensky.airports import find_airport
from aloft.opensky.client import OpenSkyClient
from aloft.opensky.resolver import (
    ResolutionError,
    resolve_callsign,
    resolve_smart,
    resolve_tail,
    to_dict,
)
from aloft.schemas import (
    ResolutionErrorResponse,
    ResolutionResponse,
    ResolveCallsignRequest,
    ResolveSmartRequest,
    ResolveTailRequest,
)
from aloft.security import require_internal_key

log = get_logger("aloft.routes.resolve")
router = APIRouter(prefix="/resolve", tags=["resolve"], dependencies=[Depends(require_internal_key)])


_REASON_TO_STATUS = {
    "no_match": status.HTTP_404_NOT_FOUND,
    "no_airport": status.HTTP_400_BAD_REQUEST,
    "no_airline": status.HTTP_404_NOT_FOUND,
    "no_registration": status.HTTP_404_NOT_FOUND,
    "invalid_input": status.HTTP_400_BAD_REQUEST,
    "ambiguous": status.HTTP_409_CONFLICT,
    "opensky_error": status.HTTP_502_BAD_GATEWAY,
}


@router.post(
    "/callsign",
    response_model=ResolutionResponse,
    responses={
        404: {"model": ResolutionErrorResponse},
        400: {"model": ResolutionErrorResponse},
        502: {"model": ResolutionErrorResponse},
    },
)
async def post_resolve_callsign(
    body: ResolveCallsignRequest,
    session: AsyncSession = Depends(get_session),
) -> ResolutionResponse:
    dep_icao: str | None = None
    arr_icao: str | None = None

    if body.dep_airport:
        airport = await find_airport(session, body.dep_airport)
        if airport is None or not airport.icao:
            raise HTTPException(
                status_code=400,
                detail={"reason": "no_airport", "detail": f"unknown dep_airport={body.dep_airport}"},
            )
        dep_icao = airport.icao

    if body.arr_airport:
        airport = await find_airport(session, body.arr_airport)
        if airport is None or not airport.icao:
            raise HTTPException(
                status_code=400,
                detail={"reason": "no_airport", "detail": f"unknown arr_airport={body.arr_airport}"},
            )
        arr_icao = airport.icao

    try:
        async with OpenSkyClient() as client:
            result = await resolve_callsign(
                body.callsign, body.date, dep_icao, arr_icao, client=client,
            )
    except ResolutionError as err:
        raise HTTPException(
            status_code=_REASON_TO_STATUS.get(err.reason, 500),
            detail={"reason": err.reason, "detail": err.detail},
        ) from err

    log.info("resolve.callsign.ok", **to_dict(result))
    return ResolutionResponse(**to_dict(result))


@router.post(
    "/smart",
    response_model=ResolutionResponse,
    responses={
        404: {"model": ResolutionErrorResponse},
        400: {"model": ResolutionErrorResponse},
        502: {"model": ResolutionErrorResponse},
    },
)
async def post_resolve_smart(
    body: ResolveSmartRequest,
    session: AsyncSession = Depends(get_session),
) -> ResolutionResponse:
    dep_airport = await find_airport(session, body.dep_airport)
    if dep_airport is None or not dep_airport.icao:
        raise HTTPException(
            status_code=400,
            detail={"reason": "no_airport", "detail": f"unknown dep_airport={body.dep_airport}"},
        )
    arr_icao: str | None = None
    if body.arr_airport:
        arr_airport = await find_airport(session, body.arr_airport)
        if arr_airport is None or not arr_airport.icao:
            raise HTTPException(
                status_code=400,
                detail={"reason": "no_airport", "detail": f"unknown arr_airport={body.arr_airport}"},
            )
        arr_icao = arr_airport.icao

    try:
        async with OpenSkyClient() as client:
            result = await resolve_smart(
                body.airline_icao,
                body.flight_digits,
                body.date,
                dep_airport.icao,
                arr_icao,
                client=client,
            )
    except ResolutionError as err:
        raise HTTPException(
            status_code=_REASON_TO_STATUS.get(err.reason, 500),
            detail={"reason": err.reason, "detail": err.detail},
        ) from err

    log.info("resolve.smart.ok", **to_dict(result))
    return ResolutionResponse(**to_dict(result))


@router.post(
    "/tail",
    response_model=ResolutionResponse,
    responses={
        404: {"model": ResolutionErrorResponse},
        400: {"model": ResolutionErrorResponse},
        502: {"model": ResolutionErrorResponse},
    },
)
async def post_resolve_tail(
    body: ResolveTailRequest,
    session: AsyncSession = Depends(get_session),
) -> ResolutionResponse:
    try:
        async with OpenSkyClient() as client:
            result = await resolve_tail(
                body.registration, body.date, session=session, client=client,
            )
    except ResolutionError as err:
        raise HTTPException(
            status_code=_REASON_TO_STATUS.get(err.reason, 500),
            detail={"reason": err.reason, "detail": err.detail},
        ) from err

    log.info("resolve.tail.ok", **to_dict(result))
    return ResolutionResponse(**to_dict(result))
