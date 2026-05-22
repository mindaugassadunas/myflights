"""
Rate-limit queue gating *all* OpenSky HTTP calls.

OpenSky free tier: 4,000 credits / day. /flights/* and /tracks/* cost credits
per day-partition crossed. We never call OpenSky outside this queue.

Design notes
- A single asyncio AsyncLimiter caps short-burst concurrency (per-second cap).
- Credit accounting is best-effort: each caller declares the credit cost it
  expects, and we persist it to the opensky_credits table for the day. The
  resolver checks the day's running total before issuing a new request.
"""
from __future__ import annotations

from aiolimiter import AsyncLimiter

from aloft.config import get_settings


class OpenSkyLimiter:
    def __init__(self, max_rate: float = 4.0, time_period: float = 1.0) -> None:
        # 4 requests/second is well below OpenSky's tolerated burst.
        self._limiter = AsyncLimiter(max_rate=max_rate, time_period=time_period)
        self._daily_budget = get_settings().opensky_daily_credit_budget

    @property
    def daily_budget(self) -> int:
        return self._daily_budget

    async def acquire(self) -> None:
        await self._limiter.acquire()

    async def __aenter__(self) -> "OpenSkyLimiter":
        await self.acquire()
        return self

    async def __aexit__(self, *_exc: object) -> None:  # noqa: D401
        return None


_limiter: OpenSkyLimiter | None = None


def get_limiter() -> OpenSkyLimiter:
    global _limiter
    if _limiter is None:
        _limiter = OpenSkyLimiter()
    return _limiter
