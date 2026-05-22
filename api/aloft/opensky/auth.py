"""
OpenSky OAuth2 client credentials flow.

OpenSky deprecated basic auth in 2024. Each request needs a bearer token
obtained via client_credentials grant from the OpenID Connect endpoint. Tokens
last ~30 minutes; we cache and refresh a minute before expiry.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

import httpx

from aloft.config import get_settings
from aloft.logging import get_logger

log = get_logger("aloft.opensky.auth")


@dataclass
class _Token:
    access_token: str
    expires_at: float  # epoch seconds

    def is_fresh(self, skew_seconds: float = 60.0) -> bool:
        return time.time() < (self.expires_at - skew_seconds)


@dataclass
class OpenSkyAuth:
    client_id: str
    client_secret: str
    token_url: str
    _token: _Token | None = field(default=None, init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False)

    async def get_token(self, client: httpx.AsyncClient | None = None) -> str:
        if self._token and self._token.is_fresh():
            return self._token.access_token

        async with self._lock:
            # Re-check inside the lock — another coroutine may have refreshed.
            if self._token and self._token.is_fresh():
                return self._token.access_token

            owns_client = client is None
            client = client or httpx.AsyncClient(timeout=10.0)
            try:
                resp = await client.post(
                    self.token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                resp.raise_for_status()
                payload = resp.json()
            finally:
                if owns_client:
                    await client.aclose()

            access_token = payload["access_token"]
            expires_in = float(payload.get("expires_in", 1800))
            self._token = _Token(
                access_token=access_token,
                expires_at=time.time() + expires_in,
            )
            log.info("opensky.token.refreshed", expires_in=expires_in)
            return access_token


_auth: OpenSkyAuth | None = None


def get_auth() -> OpenSkyAuth:
    global _auth
    if _auth is None:
        s = get_settings()
        if not s.opensky_client_id or not s.opensky_client_secret:
            raise RuntimeError(
                "OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET not configured",
            )
        _auth = OpenSkyAuth(
            client_id=s.opensky_client_id,
            client_secret=s.opensky_client_secret,
            token_url=s.opensky_token_url,
        )
    return _auth
