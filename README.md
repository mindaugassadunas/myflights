# Aloft

Personal flight log with honest, ADS-B-accurate trajectories. Single-tenant. Mobile-first PWA.

See [`CLAUDE.md`](./CLAUDE.md) for the design spec and [`PLAN.md`](./PLAN.md) for the implementation roadmap.

## Layout

```
.
├── web/        Next.js 15 (App Router) — UI, NextAuth, Prisma client, API routes
├── api/        FastAPI (Python 3.12) — OpenSky pipeline, Gmail parser, heavy jobs
├── docs/       ERD and architecture notes
├── CLAUDE.md   Project context (design system, principles, domain knowledge)
└── PLAN.md     Phased implementation plan with DoDs
```

## Prerequisites

- Node 20+ and `npm`
- Python 3.12 and [`uv`](https://github.com/astral-sh/uv)
- A Neon Postgres database (`DATABASE_URL`)
- OpenSky OAuth2 client credentials
- An Anthropic API key (Claude)
- Google OAuth (for sign-in + Gmail read scope)

Copy `.env.example` to `.env` and fill in the blanks.

## Quick start

```bash
# 1. Web (Next.js)
cd web
npm install
npx prisma generate
npx prisma migrate dev      # creates schema in your Neon DB
npm run dev                 # http://localhost:3000

# 2. API (FastAPI)
cd ../api
uv sync
uv run uvicorn aloft.main:app --reload --port 8000   # http://localhost:8000
```

Both expose `/health` returning `{"status": "ok"}` once running.

## Phase 0 / 1 status

Phase 0 (setup) and Phase 1 (data model + seeds) are scaffolded in this commit. See [`PLAN.md`](./PLAN.md) for what's still open.
