"""
CUID-like id generator for seed scripts.

Prisma owns `@default(cuid())` for app-side inserts. When seed scripts insert
via raw SQL we need to supply the id ourselves. Real Prisma CUIDs use a
specific algorithm — we just need a unique, opaque, 25-char string starting
with 'c' so the format matches.
"""
from __future__ import annotations

import secrets


def make_cuid() -> str:
    return "c" + secrets.token_hex(12)
