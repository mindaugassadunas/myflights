"""
Phase 0 sanity check: fetch an OpenSky token and hit /states/all once.

Usage:
    cd api && uv run python -m scripts.test_opensky
"""
import asyncio

from aloft.logging import configure_logging, get_logger
from aloft.opensky.client import OpenSkyClient

configure_logging()
log = get_logger("scripts.test_opensky")


async def main() -> None:
    async with OpenSkyClient() as client:
        states = await client.states_all()
        count = len(states.get("states") or []) if isinstance(states, dict) else 0
        log.info("opensky.test.ok", returned_states=count)


if __name__ == "__main__":
    asyncio.run(main())
