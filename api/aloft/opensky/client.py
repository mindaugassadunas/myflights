"""
Thin HTTP wrapper over the OpenSky API.

All calls go through OpenSkyLimiter and re-authenticate transparently. Higher
level endpoints (resolve callsign → icao24, fetch track, etc.) live in
aloft.opensky.resolver — added in Phase 2.
"""
from __future__ import annotations

from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from aloft.config import get_settings
from aloft.logging import get_logger
from aloft.opensky.auth import OpenSkyAuth, get_auth
from aloft.opensky.limiter import OpenSkyLimiter, get_limiter

log = get_logger("aloft.opensky.client")


class OpenSkyClient:
    def __init__(
        self,
        auth: OpenSkyAuth | None = None,
        limiter: OpenSkyLimiter | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = get_settings()
        self._auth = auth or get_auth()
        self._limiter = limiter or get_limiter()
        self._client = client or httpx.AsyncClient(
            base_url=self._settings.opensky_api_base,
            timeout=httpx.Timeout(30.0, connect=10.0),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "OpenSkyClient":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.close()

    @retry(
        reraise=True,
        retry=retry_if_exception_type((httpx.HTTPError,)),
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=1, max=10),
    )
    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        async with self._limiter:
            token = await self._auth.get_token(self._client)
            log.debug("opensky.request", path=path, params=params)
            resp = await self._client.get(
                path,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 401:
                # Token went stale despite skew — force-refresh once.
                self._auth._token = None  # noqa: SLF001
                token = await self._auth.get_token(self._client)
                resp = await self._client.get(
                    path,
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
            if resp.status_code >= 400:
                # OpenSky's error bodies are short and useful — bubble them up.
                log.warning(
                    "opensky.error",
                    path=path,
                    params=params,
                    status=resp.status_code,
                    body=resp.text[:500],
                )
                resp.raise_for_status()
            if resp.status_code == 204:
                return None
            return resp.json()

    async def states_all(self, **params: Any) -> Any:
        return await self._get("/states/all", params=params or None)

    async def flights_departure(self, airport: str, begin: int, end: int) -> Any:
        return await self._flights_get(
            "/flights/departure",
            params={"airport": airport, "begin": begin, "end": end},
        )

    async def flights_arrival(self, airport: str, begin: int, end: int) -> Any:
        return await self._flights_get(
            "/flights/arrival",
            params={"airport": airport, "begin": begin, "end": end},
        )

    async def flights_aircraft(self, icao24: str, begin: int, end: int) -> Any:
        return await self._flights_get(
            "/flights/aircraft",
            params={"icao24": icao24, "begin": begin, "end": end},
        )

    async def tracks_all(self, icao24: str, time: int = 0) -> Any:
        return await self._get(
            "/tracks/all",
            params={"icao24": icao24, "time": time},
        )

    async def _flights_get(self, path: str, params: dict[str, Any]) -> list[Any]:
        """`/flights/*` endpoints return 404 when there are no flights in the
        requested window. That's a "no data" response, not an error — treat
        it as an empty list so the resolver can map it to a clean
        `no_match` / `no_coverage` outcome instead of an httpx stack trace.
        """
        try:
            result = await self._get(path, params=params)
        except httpx.HTTPStatusError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                return []
            raise
        return result or []
