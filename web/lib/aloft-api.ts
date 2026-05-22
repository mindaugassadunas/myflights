import "server-only";

/**
 * Server-only client for the FastAPI service. Uses INTERNAL_API_KEY to
 * authenticate; in dev mode (key empty) the FastAPI side accepts any caller.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "";

export type ResolutionResult = {
  icao24: string;
  callsign: string | null;
  first_seen_utc: string; // ISO
  last_seen_utc: string;
  dep_airport_icao: string | null;
  arr_airport_icao: string | null;
  candidates: number;
};

export type TrackResult = {
  flight_id: string;
  icao24: string;
  point_count: number;
  distance_km: number;
  duration_min: number;
  waypoints: Array<{
    t: number;
    lat: number;
    lon: number;
    alt_m: number | null;
    heading: number | null;
    on_ground: boolean;
  }>;
  gaps: Array<{ start: number; end: number; duration_s: number }>;
  great_circle: Array<{ lat: number; lon: number }>;
  fetched_at: string;
};

export type ResolveCallsignBody = {
  callsign: string;
  date: string; // YYYY-MM-DD
  dep_airport?: string;
  arr_airport?: string;
};

export type ResolveSmartBody = {
  airline_icao: string;
  flight_digits?: string;
  date: string;
  dep_airport: string;
  arr_airport?: string;
};

export type ResolveTailBody = {
  registration: string;
  date: string;
};

export type ScheduleLookupBody = {
  flight_number: string;
  date: string; // YYYY-MM-DD
};

export type ScheduleLookupResult = {
  flight_number: string;
  callsign: string | null;
  airline_iata: string | null;
  airline_icao: string | null;
  dep_airport_icao: string | null;
  dep_airport_iata: string | null;
  arr_airport_icao: string | null;
  arr_airport_iata: string | null;
  aircraft_model: string | null;
  aircraft_registration: string | null;
  scheduled_dep_utc: string | null;
  scheduled_arr_utc: string | null;
};

export class AloftApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    public detail: string | null,
  ) {
    super(`${status} ${reason}${detail ? `: ${detail}` : ""}`);
  }
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (INTERNAL_KEY) headers["X-Internal-Key"] = INTERNAL_KEY;

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
    cache: "no-store",
  });

  if (!resp.ok) {
    let reason = resp.statusText;
    let detail: string | null = null;
    try {
      const payload = (await resp.json()) as { detail?: { reason?: string; detail?: string } };
      const d = payload?.detail;
      if (typeof d === "object" && d) {
        reason = d.reason ?? reason;
        detail = d.detail ?? null;
      }
    } catch {
      // body wasn't JSON
    }
    throw new AloftApiError(resp.status, reason, detail);
  }
  return (await resp.json()) as T;
}

export const aloftApi = {
  resolveCallsign(body: ResolveCallsignBody, signal?: AbortSignal) {
    return call<ResolutionResult>("POST", "/resolve/callsign", body, signal);
  },
  resolveSmart(body: ResolveSmartBody, signal?: AbortSignal) {
    return call<ResolutionResult>("POST", "/resolve/smart", body, signal);
  },
  resolveTail(body: ResolveTailBody, signal?: AbortSignal) {
    return call<ResolutionResult>("POST", "/resolve/tail", body, signal);
  },
  scheduleLookup(body: ScheduleLookupBody, signal?: AbortSignal) {
    return call<ScheduleLookupResult>("POST", "/schedule/lookup", body, signal);
  },
  fetchTrack(flightId: string, signal?: AbortSignal) {
    return call<TrackResult>("GET", `/tracks/${encodeURIComponent(flightId)}`, undefined, signal);
  },
};
