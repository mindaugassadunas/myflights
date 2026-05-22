# aloft-api

FastAPI backend: OpenSky resolution pipeline, Gmail email parsing, heavy/long-running jobs.

## Setup

```bash
uv sync                       # install deps
cp ../.env.example .env       # then fill in values
uv run uvicorn aloft.main:app --reload --port 8000
```

Hit `http://localhost:8000/health` — expect `{"status": "ok"}`.

## Scripts

```bash
uv run python -m scripts.test_opensky            # verify OAuth2 + /states/all
uv run python -m scripts.seed_airports           # OurAirports CSV → DB
uv run python -m scripts.seed_airlines           # OpenFlights → DB
uv run python -m scripts.seed_aircraft_types     # curated top types → DB
uv run python -m scripts.sync_aircraft_db        # monthly OpenSky aircraft DB
```

## Layout

```
aloft/
├── main.py           FastAPI app, routes
├── config.py         pydantic-settings (reads .env)
├── logging.py        structlog JSON config
├── db.py             SQLAlchemy async engine + session
├── models.py         SQLAlchemy models (mirrors prisma/schema.prisma)
└── opensky/
    ├── auth.py       OAuth2 client credentials, token cache
    ├── limiter.py    aiolimiter wrapper, credit accounting
    └── client.py     HTTP client wrapping /flights, /tracks, /states

scripts/              Standalone CLI scripts (one-off seeds + cron jobs)
```
