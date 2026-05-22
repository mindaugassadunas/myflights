"""
INTERNAL_API_KEY header check.

The FastAPI service is called by Next.js (and by scheduled workers). There's
no user auth here — NextAuth handles users at the web layer. We just require
a shared secret in the `X-Internal-Key` header so the API can't be hit from
the open internet.

If `INTERNAL_API_KEY` is empty, auth is disabled (dev convenience). Set it in
prod to enforce.
"""
from __future__ import annotations

from fastapi import Header, HTTPException, status

from aloft.config import get_settings


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_api_key
    if not expected:
        return  # auth disabled
    if x_internal_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing X-Internal-Key",
        )
