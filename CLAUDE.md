# CLAUDE.md

Context file for Claude Code. Read this before writing any code in this repo.

---

## Project

**Working name:** Aloft (rename freely)

A personal flight log app. The user enters flights they've taken (manually or via Gmail import), the backend resolves each flight to a real aircraft trajectory via the OpenSky Network, and the app renders honest, ADS-B-accurate maps and lifetime stats. Unlike Flighty / App in the Air / OpenFlights, this shows the *actual flown path*, not a great-circle approximation.

Single-tenant. Built for one user (the owner). No multi-user, no public profiles in v1.

---

## Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui with the `radix-lyra` preset (matches the F1 dashboard's boxy aesthetic, scales down well to mobile)
- **Mobile interaction:** Vaul (bottom sheets / drawers), `react-swipeable` or Framer Motion for gestures
- **PWA:** `@serwist/next` for service worker tooling
- **Maps:** MapLibre GL JS (free, OSS, no token, mobile-optimized), with `maplibre-gl-globe` for the 3D view
- **Charts:** Plotly.js for altitude/speed profiles. **Note:** Plotly is heavy on mobile (~3MB gzipped). Lazy-load it only on screens that need it. Consider Recharts or visx for the lighter stats dashboard.
- **Backend:** FastAPI on Railway (Python 3.12)
- **Database:** Neon Postgres (upgrade existing project or create new one)
- **ORM:** Prisma on the Next.js side for app queries, SQLAlchemy on the FastAPI side for ingestion
- **Auth:** NextAuth.js with a single hardcoded user (the owner). No signup flow.
- **AI:** Claude API (Opus or Sonnet) for email parsing and recap generation
- **Email parsing:** Gmail OAuth (direct, not MCP — the app needs to run unattended)
- **Background jobs:** Vercel Cron for light scheduling; a simple worker on Railway for heavy backfills
- **Aviation libraries (Python):** `traffic`, `pyOpenSky`, `OpenAP` (for CO₂ / fuel burn)

---

## Design system

**Mobile-first.** This app is used primarily on a phone, in transit, often one-handed. Every screen is designed for a 390px viewport first; desktop is a progressive enhancement, not the primary target. The Dark Precision aesthetic from the F1 dashboard carries over (dark surfaces, thin lines, monospace data) but density and interaction model are rebuilt for touch.

### Palette

Same Dark Precision palette as the F1 dashboard. Dark surfaces are mandatory — easier on the eyes mid-flight, save battery on OLED, and let route lines glow.

- Background: `#0A0B0D` (near-black, slight cool tint)
- Surface: `#13151A`
- Surface elevated (bottom sheets, modals): `#1A1D23`
- Border: `#1F2228`
- Text primary: `#E8EAED`
- Text secondary: `#8B9099`
- Accent (route lines, primary CTA): `#00D4FF`
- Altitude gradient: deep blue (low) → cyan → green → amber (high, FL400+)
- Warning / gap: `#E8A547`
- Success / resolved: `#4ADE80`

Light mode is **not** in scope for v1. Document this so it doesn't get litigated later.

### Type

- Headings, UI: **Titillium Web** (300, 400, 600)
- Data, numbers, coordinates, timestamps: **JetBrains Mono** (400, 500)
- Body: Titillium Web 400

**Mobile scale (default):**
- Display: 28px / 32px line-height (rare — hero numbers only)
- H1: 22px / 28px
- H2: 18px / 24px
- Body: 16px / 24px (**never below 16px on form inputs — iOS zooms on focus otherwise**)
- Small: 14px / 20px (metadata, captions)
- Mono data: 15px / 20px

**Desktop scale:** bump everything ~15%. Use `clamp()` or Tailwind responsive variants, don't hardcode.

### Spacing

- Base unit: 4px
- Card / sheet padding: **20px on mobile**, 16px on desktop (touch targets need room — the F1 dashboard's 16px is too tight for fingers)
- Section gap: 24px on mobile, 16px on desktop
- Tap target minimum: **44×44pt** (Apple HIG). No exceptions.
- Thumb zone: primary actions live in the bottom 40% of the screen. Don't put critical CTAs at the top.

### Corners & motion

- Corners: sharp on data containers (2px max), softer on touch elements (8px on buttons, 12px on bottom sheets — feels right for swipe-up affordance).
- Motion: ease-out 250–350ms for sheets and transitions. Spring physics on swipe gestures only (Vaul handles this). No bouncy entrances. No emoji.

---

## Mobile-specific interaction model

### Navigation

**Bottom tab bar**, four tabs + center floating action button. Thumbs reach the bottom of the screen, not the top.

```
┌─────────────────────────────────┐
│                                 │
│           [ content ]           │
│                                 │
├─────────────────────────────────┤
│  Map   Log   [+]   Stats  More  │
└─────────────────────────────────┘
```

- **Map:** default tab. Full-bleed world map with all flights.
- **Log:** flight list, reverse chronological.
- **[+]:** floating action button, opens add-flight bottom sheet.
- **Stats:** lifetime dashboard.
- **More:** settings, Gmail import, export.

Active tab indicated by accent color on icon + label. No sliding indicator — feels too web.

### Sheets, not modals

All overlays are **bottom sheets** (Vaul). Dialogs feel desktop-y and waste vertical space.

- Filters → bottom sheet with snap points (peek, half, full)
- Flight detail (from map tap) → bottom sheet, swipe up to expand, swipe down to dismiss
- Add flight form → full-height bottom sheet with drag handle
- Confirmations → small bottom sheet, not centered alert

### Lists, not tables

The flight list is **cards**, not table rows. Each card ~80–100px tall, tappable as a whole, key info legible at a glance:

```
┌─────────────────────────────────┐
│  VNO → AMS         Mon 14 Apr   │
│  KL1772 · A320 · 2h 35m         │
│  ✓ tracked                      │
└─────────────────────────────────┘
```

- **Left swipe** on a card → reveal "delete" / "re-resolve" actions
- **Long press** → quick preview (haptic feedback where supported)
- **Pull to refresh** at the top of the list

### Maps on mobile

- Full-bleed by default (edge to edge, ignore safe areas for the canvas)
- Floating controls (zoom, layer toggle, search) anchored to top-right with safe-area padding
- Tap a flight line → bottom sheet with that flight's detail
- Pinch to zoom (native), double-tap to zoom in, two-finger tap to zoom out
- Hide overlay UI when the user pans (re-show on tap)
- "Locate me" button is bottom-right, above the tab bar

### Forms

Multi-step flows beat long forms on mobile.

- **Add flight** is a 3-step bottom sheet: route → date & flight number → optional details. Each step fills the visible area. Back/Next at the bottom in the thumb zone.
- Inputs are 48px tall minimum, 16px text size (no iOS zoom).
- Autocomplete results render as a scrollable list inside the sheet, not a dropdown popover.
- Native pickers wherever possible (date, time) — they handle accessibility, scrolling, and timezone correctly for free.

### Gestures

- Swipe between adjacent flights in detail view (horizontal pager)
- Swipe down to dismiss any full-screen sheet
- Swipe left on list cards for actions
- Two-finger rotate on the 3D globe view
- No gesture is the *only* way to do something — every gesture has a button equivalent for accessibility

### Safe areas

Always respect `env(safe-area-inset-*)`. Bottom tab bar adds `padding-bottom: env(safe-area-inset-bottom)`. Top of screen accounts for notch / dynamic island. Test on a real iPhone with a notch before claiming "done."

---

## PWA

The app ships as a PWA so the owner installs it to home screen and gets an app-like experience without an app store.

- **Manifest:** name, icons (180×180 minimum for iOS), `display: standalone`, theme color matches `#0A0B0D`.
- **Service worker:** caches the app shell + last-fetched flight data. Read-only offline access to logged flights and stats. Map tiles cache opportunistically.
- **Add-to-home-screen prompt:** subtle banner after 3 sessions, dismissible permanently.
- **Background sync:** queued flight submissions sync when connectivity returns (useful when adding a flight mid-air on shaky wifi).
- **Push notifications:** out of scope for v1, but architect the service worker so they can be added later.

---

## Responsive breakpoints

Tailwind defaults, used sparingly:

- `sm` (640px): minor tweaks for larger phones / small tablets
- `md` (768px): tablet portrait — list and detail can coexist (split view)
- `lg` (1024px): desktop — multi-column dashboard, persistent sidebar nav replaces bottom tabs
- `xl`+: don't over-design. The owner won't be on a 4K monitor often.

**The bottom tab bar disappears at `lg` and is replaced by a left sidebar.** Everything else scales fluidly.

---

## Architecture principles

### 1. Never store raw OpenSky state vectors

Same rule as the F1 dashboard with FastF1 telemetry. State vectors are too dense (one per second per plane) and OpenSky's terms of use restrict redistribution. **Store only:**

- Resolved flight metadata (icao24, callsign, departure, arrival, times)
- A waypoint array per flight (compressed, typically 50–500 points after downsampling)
- Coverage gap markers (timestamps where data is missing)

Re-fetch full state vector data on demand if a user wants to drill into a specific flight at full resolution. Cache aggressively per-flight, not globally.

### 2. Coverage gaps are first-class data

OpenSky's coverage is non-uniform. Oceans, polar routes, parts of Asia and Africa have sparse or no ADS-B reception. The app must:

- Detect gaps (any segment > 60s without an observation)
- Store gap segments alongside waypoints
- Render gaps as dashed lines or with reduced opacity, labeled "no ADS-B coverage"
- Never interpolate or fabricate intermediate positions
- Always also store a great-circle path as fallback geometry

### 3. Rate limits are the binding constraint

OpenSky free tier: 4,000 credits/day. `/flights/*` and `/tracks/*` cost credits per day-partition crossed. A 10-year backfill of 200 flights could easily burn 800+ credits if done naively. **Therefore:**

- All OpenSky calls go through a single rate-limited queue (Python `aiolimiter` or similar)
- Backfills are throttled and resumable
- Track resolution is idempotent (same input → same output, cache forever)
- Credit budget is exposed in the admin UI

### 4. OpenSky may block hyperscaler IPs

Railway, Vercel, and AWS IP ranges are sometimes blocked due to abuse. If 403s appear in production:

- Test the request from a Hetzner / OVH / local VPS
- If confirmed, route OpenSky calls through a small proxy on a non-hyperscaler VPS
- Don't waste a sprint debugging this — it's a known issue

### 5. Resolution is best-effort

Not every logged flight will resolve to ADS-B data. Reasons: pre-2014 flights (ADS-B coverage thin), regional coverage gaps, callsign mismatches, military-style filtering. The app must gracefully degrade:

- Flight stored with manual metadata + great-circle path
- "ADS-B track unavailable" badge in the UI
- Optional retry endpoint (user can re-attempt resolution later)

### 6. Gmail parsing is AI-mediated, not regex

Booking confirmation formats vary wildly across airlines, OTAs, and corporate booking tools. Don't write per-vendor regex. Instead:

- Fetch raw email body (HTML stripped to text)
- Send to Claude API with a JSON schema for `Flight[]`
- Validate the response, surface to user for confirmation before insert
- Store the source email ID to prevent duplicate imports

### 7. Mobile performance is a hard constraint

Mobile networks are slow and flaky; mobile CPUs throttle aggressively. Therefore:

- **Bundle size:** the initial JS payload to render the Map tab must be < 250KB gzipped. Plotly, globe.gl, and other heavy libraries are dynamic-imported only on screens that need them.
- **Lazy load by tab:** the Stats tab's chart library doesn't ship until the user opens Stats. Same for the 3D globe.
- **Viewport culling on maps:** never render all flights at once if there are hundreds. Cluster, simplify, or filter by viewport bounds.
- **Image optimization:** all aircraft photos served via Next.js Image with `sizes="(max-width: 768px) 100vw, 50vw"`. Cap at 800px wide for mobile.
- **Skeleton states, not spinners:** every screen has a shimmer/skeleton matching its final layout. Spinners feel slower even when they aren't.
- **Optimistic UI on writes:** adding a flight inserts the card immediately; resolution status updates async.

---

## Domain knowledge

### ICAO24

A 24-bit hex code (e.g., `3c6444`) uniquely identifying an aircraft's transponder. Permanent per airframe — when a plane changes registration (e.g., D-AIXP → N-something after sale), the ICAO24 stays. OpenSky keys everything off this.

### Callsign

What the pilot transmits and what ATC uses. Looks like `DLH892` (Lufthansa flight 892) for commercial flights, or a tail number for private aircraft. Found in the `callsign` field of state vectors and `/flights/*` results, usually padded with trailing spaces (`"DLH892  "`). **Always trim before comparing.**

### Tail number / registration

Human-readable aircraft ID like `D-AIXP`, `N12345`, `G-XWBA`. Maps to ICAO24 via the OpenSky aircraft database. Useful for users who only remember the visible registration, not the flight number.

### Resolution flow

```
User input (callsign+date OR tail+date)
        ↓
   Look up airport(s) and time window
        ↓
   Query OpenSky /flights/departure OR /flights/aircraft
        ↓
   Filter / disambiguate (if multiple matches)
        ↓
   icao24 + firstSeen + lastSeen
        ↓
   Query /tracks/all (lighter) OR state vectors (heavier)
        ↓
   Downsample, detect gaps, store
```

### Day-partition rule

OpenSky's `/flights/*` endpoints partition by UTC calendar day. A query spanning multiple days costs multiple credits. Long-haul flights crossing midnight UTC count as 2 days. **Build credit estimates assuming this.**

### Auth model

OpenSky now requires OAuth2 client credentials (basic auth is deprecated). Get `client_id` and `client_secret` from the OpenSky account page, exchange for a bearer token, refresh as needed. Store tokens in Railway secrets, not the database.

---

## Data model (high level)

Schema in `prisma/schema.prisma` and `backend/models.py`. Single source of truth: Prisma (the FastAPI side mirrors it via codegen or hand-maintained Pydantic models).

Core tables:

- `flights` — one row per logged flight (id, callsign, date, dep_airport, arr_airport, icao24 nullable, status, source)
- `tracks` — waypoint arrays per flight (flight_id, waypoints jsonb, gaps jsonb, fetched_at, source)
- `airports` — seeded from OurAirports.com CSV (icao, iata, name, city, country, lat, lon, elevation)
- `aircraft` — seeded from OpenSky aircraft DB (icao24, registration, type_code, model, operator, year_built)
- `aircraft_types` — seeded type metadata (code, manufacturer, model, fuel_burn_per_hour_kg, seats_typical)
- `airlines` — seeded (icao, iata, name, country)
- `trips` — derived groupings of flights (auto-clustered: round-trip = 1 trip)
- `email_imports` — Gmail message IDs already processed, to prevent dupes
- `opensky_credits` — daily usage log for rate-limit budgeting

Indexes: `flights(date)`, `flights(icao24)`, `tracks(flight_id)`, `aircraft(registration)`, `aircraft(icao24)`.

---

## Conventions

- **Time:** All timestamps in UTC, ISO 8601, with explicit `_utc` suffix on column names. Convert to local only at the UI layer.
- **Distance:** Kilometers everywhere in the DB and API. Convert to miles only if a UI preference is set.
- **Altitude:** Meters in storage. Display as feet (aviation standard) in UI.
- **Speed:** m/s in storage, knots in UI.
- **IDs:** CUIDs (Prisma default), not UUIDs.
- **Error handling:** Never silently fail an OpenSky resolution. Always store the failure reason on the flight row so the UI can show why.
- **Logging:** Structured JSON logs to stdout. No print statements.
- **Testing:** Pytest for backend, Vitest for frontend. Critical path: resolution pipeline, Gmail parser, gap detection.

---

## What not to do

- Don't store raw state vectors. See principle 1.
- Don't write per-airline email regex. See principle 6.
- Don't interpolate across coverage gaps. See principle 2.
- Don't bulk-fetch tracks on first load — paginate / lazy-load on map zoom.
- Don't use Mapbox unless the user explicitly opts in (their free tier is fine but adds a vendor dependency).
- Don't build social features in v1. Single user only.
- Don't add achievements / badges until stats are solid.