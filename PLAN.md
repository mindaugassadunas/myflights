# PLAN.md

Implementation plan for Aloft (personal flight log). Phases are ordered by dependency; tasks within a phase are mostly parallelizable. Each task has a Definition of Done (DoD) — don't move on until it's true.

---

## Phase 0 — Setup (half a day)

**Goal:** repos exist, infra exists, you can deploy a hello-world end to end.

1. **Init monorepo with two packages: `web/` (Next.js) and `api/` (FastAPI).**
   DoD: `pnpm install` and `uv sync` both pass at repo root.

2. **Provision Neon Postgres.**
   Upgrade the existing project to Launch plan or spin up a new one. Save `DATABASE_URL` to `.env.example`.
   DoD: `psql $DATABASE_URL` connects successfully.

3. **Deploy `web/` to Vercel and `api/` to Railway.**
   Both should serve a `/health` endpoint returning `{ "status": "ok" }`.
   DoD: both URLs respond 200 in production.

4. **Register OpenSky API client and store credentials in Railway secrets.**
   DoD: a one-off Python script in `api/scripts/test_opensky.py` successfully fetches a bearer token and queries `/states/all`.

5. **Install shadcn/ui with the `radix-lyra` preset, plus Vaul for bottom sheets.**
   Add Titillium Web and JetBrains Mono via `next/font/google`. Wire up the Dark Precision palette in `tailwind.config.ts`. Configure viewport meta tag for mobile (`width=device-width, initial-scale=1, viewport-fit=cover`). Add safe-area CSS utilities.
   DoD: a `/styleguide` page renders typography + color tokens correctly at 390px width with no horizontal scroll; safe-area insets respected on a notched iPhone.

6. **PWA scaffolding with `@serwist/next`.**
   Manifest with name, icons (180×180, 192×192, 512×512), `display: standalone`, theme color `#0A0B0D`. Service worker registered. App shell cached.
   DoD: the app can be added to home screen on iOS and Android; it opens in standalone mode without browser chrome.

7. **Set up Prisma and run a no-op migration.**
   DoD: `prisma migrate dev` succeeds against Neon.

---

## Phase 1 — Data model & seed data (1 day)

**Goal:** schema is in place and reference data is loaded.

7. **Define Prisma schema** for `flights`, `tracks`, `airports`, `aircraft`, `aircraft_types`, `airlines`, `trips`, `email_imports`, `opensky_credits`.
   DoD: `prisma migrate dev` creates all tables; ERD generated in `docs/erd.md`.

8. **Seed airports from OurAirports.com.**
   Download `airports.csv`, filter to `type IN ('large_airport', 'medium_airport')` to keep seed size sane (~10K rows). Write a one-off Python script in `api/scripts/seed_airports.py`.
   DoD: `SELECT count(*) FROM airports` returns ~10,000.

9. **Seed airlines** from a public CSV (OpenFlights `airlines.dat` is fine).
   DoD: top 100 airlines by IATA code are queryable.

10. **Seed aircraft types** with fuel burn data.
    Use OpenAP's aircraft database or build a small curated list (top 30 commercial types: A320, A321, A330-300, A350-900, B737-800, B777-300ER, B787-9, etc.) with `fuel_burn_per_hour_kg` and `seats_typical`.
    DoD: an A320 row exists with `fuel_burn_per_hour_kg ≈ 2400`.

11. **Aircraft DB sync job.**
    A scheduled Railway job that downloads OpenSky's aircraft DB CSV monthly and upserts into the `aircraft` table.
    DoD: cron is configured; first sync completes; row count > 200,000.

---

## Phase 2 — OpenSky resolution pipeline (2–3 days)

**Goal:** given a flight identifier, produce a track and store it.

12. **OAuth2 client in `api/opensky/auth.py`.**
    Fetches and caches bearer tokens, refreshes on expiry.
    DoD: 10 consecutive API calls reuse the same cached token; expired token triggers refresh.

13. **Rate-limit queue.**
    A single `aiolimiter.AsyncLimiter` instance gating all OpenSky calls. Logs every call's credit cost to `opensky_credits`.
    DoD: hitting the queue with 50 concurrent requests never exceeds the per-second cap.

14. **Resolver: callsign + date → icao24.**
    `POST /resolve/callsign` takes `{callsign, date, dep_airport?, arr_airport?}`. Queries `/flights/departure` or `/flights/arrival` for the day, filters by trimmed callsign. Returns `{icao24, firstSeen, lastSeen}` or `null`.
    DoD: known historical flight (e.g., a recent LH892 FRA→IAD) resolves correctly.

15. **Resolver: registration + date → icao24.**
    `POST /resolve/tail` takes `{registration, date}`. Looks up `aircraft.icao24` by registration, then queries `/flights/aircraft`.
    DoD: known tail+date resolves correctly.

16. **Track fetcher.**
    `GET /tracks/{flight_id}` fetches `/tracks/all` for the flight, downsamples to ≤500 points, detects gaps (>60s without observation), stores both waypoints and gap segments.
    DoD: a real flight's track is stored; gaps are correctly identified for an oceanic flight.

17. **State vector fetcher (high-res mode).**
    `GET /tracks/{flight_id}/full` fetches all state vectors in the time range. Used for altitude/speed profiles.
    DoD: a 1-hour flight returns ≥500 state vectors with altitude, ground speed, vertical rate.

18. **Resolution status on flights.**
    Each flight row carries `resolution_status` (`pending`, `resolved`, `no_coverage`, `ambiguous`, `failed`) and `resolution_error` (text). Failed resolutions are inspectable.
    DoD: a deliberately bogus callsign produces `failed` status with a useful error message.

---

## Phase 3 — Manual flight entry (1–2 days)

**Goal:** owner can log a flight by hand.

19. **Auth.**
    NextAuth.js with Google provider, allow-listed to a single email. Sessions stored in Postgres.
    DoD: only the owner's Google account can sign in.

20. **`POST /flights` API route.**
    Accepts `{date, callsign?, registration?, dep_airport, arr_airport, ...}`. Persists, then enqueues a resolution job.
    DoD: flight row appears in DB with `resolution_status = 'pending'`.

21. **Background resolver worker.**
    A Railway worker (or Vercel Cron at 5-min intervals) that picks up pending flights and runs the resolution pipeline.
    DoD: a flight submitted via the UI shows `resolved` status within 5 minutes.

22. **Manual entry form as a 3-step bottom sheet (Vaul).**
    Step 1: route (dep airport, arr airport — both autocomplete from `airports` table). Step 2: date + flight number / tail. Step 3: optional details (seat, notes, aircraft type override). Back / Next buttons in the thumb zone at the bottom of the sheet. Inputs 48px tall, 16px text size (no iOS zoom). Native date picker. Drag handle at the top of the sheet for dismiss.
    DoD: a flight can be entered end-to-end in <30 seconds on a phone with thumb-only typing.

23. **Flight list view as a card list.**
    Reverse-chronological. Each card ~90px tall: route, date, callsign + aircraft + duration, status badge. Pull-to-refresh at the top. Left-swipe reveals "delete" and "re-resolve" actions. Tap → detail page. Virtualized list (`react-virtuoso` or similar) once flight count exceeds 100.
    DoD: list scrolls at 60fps with 500 flights; swipe actions work on real iOS Safari and Android Chrome.

---

## Phase 4 — Gmail import (3–4 days)

**Goal:** backfill years of flights from email.

24. **Gmail OAuth flow.**
    Owner connects their Google account with `gmail.readonly` scope. Refresh token stored in Railway secrets.
    DoD: a button in the UI initiates OAuth and confirms successful connection.

25. **Email search.**
    A Python service searches Gmail for likely flight confirmations: queries like `from:(amexgbt OR navan OR tripit OR booking.com OR lufthansa.com OR ryanair.com) subject:(confirmation OR itinerary OR e-ticket)`. Returns message IDs.
    DoD: a search across the owner's inbox returns >50 candidate emails for someone who's flown 50+ times.

26. **Email parser via Claude API.**
    For each candidate email, strip HTML to text, send to Claude with a Pydantic schema:
    ```python
    class ParsedFlight(BaseModel):
        date: date
        callsign: str | None
        airline_iata: str | None
        dep_airport: str  # IATA or ICAO
        arr_airport: str
        passenger_name: str | None
        booking_reference: str | None
    
    class EmailParse(BaseModel):
        flights: list[ParsedFlight]
        confidence: Literal["high", "medium", "low"]
    ```
    Use structured outputs / tool use to enforce the schema.
    DoD: 10 sample emails from different airlines parse correctly.

27. **Import confirmation UI.**
    Parsed flights appear in a review table, grouped by source email. Owner checks/unchecks, edits if needed, then bulk-creates.
    DoD: 20 emails can be reviewed and imported in <2 minutes.

28. **Deduplication.**
    Before insert, check `email_imports` for the source message ID. Check `flights` for same date + callsign + route.
    DoD: re-running the import on the same inbox creates zero new rows.

29. **Throttled backfill.**
    A "scan inbox" button kicks off a job that paginates through Gmail in batches of 50, with progress UI. Resolution jobs are queued at OpenSky's credit-aware rate.
    DoD: a 200-flight backfill completes overnight without breaching daily credit limits.

---

## Phase 5 — Visualization (3–4 days)

**Goal:** the app looks worth using.

30. **World map (overview) — mobile-first.**
    MapLibre GL JS, full-bleed (edge to edge). Dark base map (CARTO Dark Matter or self-hosted Protomaps). All flights rendered as polylines: ADS-B track where available, great-circle dashed where not. **Viewport culling:** only render flights whose bounding box intersects the current viewport. Floating zoom + layer controls top-right, respecting safe-area insets. Tap a flight line → bottom sheet with that flight's detail. Tab bar transparent over the map.
    DoD: 200+ flights render at 60fps on an iPhone 12-era device; pinch-zoom and pan feel native; bottom sheet appears within 100ms of tapping a flight.

31. **Flight detail as a bottom sheet (from map) and full screen (from list).**
    From the map: tap → bottom sheet at half snap point with summary; drag up to full snap point for altitude/speed charts and gap info. From the list: full screen with back button. Swipe down dismisses on both. Plotly is lazy-loaded only when the sheet expands to full.
    DoD: detail sheet loads in <1s for a cached track; charts only ship in the bundle when the user expands the sheet.

32. **Bottom tab bar navigation.**
    Four tabs (Map, Log, Stats, More) + center FAB for add flight. Active state in accent color. Bottom inset respects `env(safe-area-inset-bottom)`. Tab bar hidden on detail screens. Replaced by a left sidebar at `lg` breakpoint.
    DoD: tab switching is instant (no route-level loading state); FAB opens add-flight sheet; on iPhone the home indicator doesn't overlap tab labels.

32. **3D globe view.**
    Toggle on the overview map: switch to `maplibre-gl-globe` (or globe.gl as fallback). Same flights, projected on a sphere.
    DoD: spinning the globe is smooth; flights render correctly across the antimeridian.

33. **Color encoding.**
    Altitude as line color gradient (deep blue → cyan → green → amber). Optional toggle: color by year / airline / aircraft type.
    DoD: legend renders; encoding toggle works without re-fetching data.

34. **Stats dashboard — vertical-scroll, mobile-first.**
    Top-level metrics as stacked hero cards: total flights, total km, total hours airborne, airports visited, countries visited, lifetime CO₂. Below, horizontal-scroll carousels for "this year vs last year" and "year-by-year history." Use lightweight charts (Recharts or visx) here, not Plotly — this screen is visited often, must load fast. Section dividers, generous vertical spacing.
    DoD: dashboard renders in <500ms on a mid-tier Android; initial JS payload for this route < 200KB gzipped.

---

## Phase 6 — Aircraft intelligence (2 days)

**Goal:** the differentiating "aircraft nerdery" features.

35. **Same-tail detection.**
    A query that groups the owner's flights by `icao24` and surfaces aircraft flown ≥2 times. List view with date pairs.
    DoD: page renders correctly with at least one same-tail entry for a backfilled dataset.

36. **Aircraft profile pages.**
    `/aircraft/[icao24]` shows type, registration, age, operator history (if available), and every flight the owner took on it.
    DoD: profile loads from a flight detail page via a clickable registration link.

37. **Aircraft photo integration.**
    Fetch a representative photo per type from Planespotters API (free, requires attribution) or fall back to a generic silhouette by ICAO type code.
    DoD: 90% of flights have an aircraft photo in the detail view.

---

## Phase 7 — Stats & analytics (2–3 days)

**Goal:** the dashboard becomes a thing the owner actually visits.

38. **Year-over-year view.**
    Bar chart of flights per year, total km per year. Click a year → that year's flights.
    DoD: chart renders with sane sorting and axis formatting.

39. **CO₂ calculator.**
    For each flight: `distance_km × aircraft_type.fuel_burn_per_hour_kg × hours / passenger_load / 1000 × 3.16` (jet fuel → CO₂ multiplier). Cache per flight.
    DoD: a known-distance flight (e.g., 5,800 km transatlantic on a 777-300ER) computes a defensible per-passenger CO₂ number (~1.0 tonnes).

40. **Equivalents.**
    "X laps around the Earth", "Y years of average citizen emissions", "Z trees needed to offset." Stored as a config so phrasing can be tuned.
    DoD: equivalents update live when filters change.

41. **Records & superlatives.**
    Longest flight, shortest flight, highest altitude reached, fastest ground speed, busiest year, longest gap without flying.
    DoD: each record links to the specific flight that holds it.

42. **Trip clustering.**
    A nightly job groups flights into trips by time and geography proximity (gap ≤ 21 days, return to a "home" airport delimits the trip).
    DoD: a known trip (e.g., VNO → AMS → JFK ... → JFK → AMS → VNO) is correctly grouped as one trip.

---

## Phase 8 — Polish & extras (open-ended)

**Goal:** the things that make it delightful, not just functional.

43. **Annual recap generator.**
    "Your year in flights" as a shareable card. Generated via Claude API given a year's flight summary JSON. Renders as a static HTML page suitable for screenshot.
    DoD: a 2024 recap page exists with copywriting that doesn't sound like an LLM.

44. **Flight playback.**
    On the detail page, a play button animates an aircraft icon along the route in real-time-equivalent (or sped up). Altitude indicator syncs.
    DoD: playback runs smoothly for any flight under 12 hours.

45. **Export.**
    Download all flights as KML (for Google Earth), GeoJSON, or CSV. Calendar export as iCal.
    DoD: a KML export opens correctly in Google Earth with all routes visible.

46. **Upcoming flight detection.**
    A daily Gmail scan for future-dated bookings. Parsed flights stored as `status = 'upcoming'`. Detail page shows weather, on-time history for that route.
    DoD: a known future booking appears in the upcoming flights view within 24 hours of the email arriving.

47. **Natural language query.**
    Chat-style input that translates "show my flights to Asia in 2024" to SQL via Claude, runs it, returns filtered results.
    DoD: 5 sample queries return correct results.

48. **Photo attachments.**
    Each flight can have photos attached (uploaded to S3 or Cloudflare R2). Window-seat photos can be tagged with the rough timestamp they were taken, optionally pinned to the trajectory.
    DoD: a flight detail page renders attached photos in a strip.

---

## Out of scope (for now)

- Multi-user / public profiles
- Mobile native app (web responsive only)
- Real-time tracking of in-progress flights
- Booking integration
- Loyalty program tracking
- Friends / social features

These are listed only to keep them out of the v1 backlog. Revisit after v1 ships.

---

## Suggested order if you want a usable v1 in two weekends

Weekend 1: Phases 0, 1, 2, 3. End state: can manually log a flight on your phone, see it resolved to a real ADS-B track on a flight detail page. PWA installable to home screen.

Weekend 2: Phase 4 (Gmail import) + Phase 5 (map + stats). End state: backfilled history, world map, basic dashboard — all feeling native on iPhone.

Everything beyond that is iteration on a working product.

## Mobile testing discipline

Don't claim a feature is done until it's been tested on:

- A real iPhone (preferably notched, for safe-area issues) in **Safari** (not Chrome iOS — same WebKit, but the install flow differs)
- A real Android device in Chrome
- Both with the PWA installed to home screen and launched in standalone mode

Things that work in desktop Chrome devtools mobile emulator but fail on real devices: safe-area-inset, viewport units (`100vh` vs `100dvh`), iOS input zoom on focus, scroll bounce, swipe-back gestures conflicting with horizontal pagers. Test on real glass.