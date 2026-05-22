import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Planespotters public photo API client with DB-backed caching.
 *
 * Free, no auth, attribution required. Endpoints:
 *   GET https://api.planespotters.net/pub/photos/reg/{registration}
 *   GET https://api.planespotters.net/pub/photos/hex/{icao24}
 *   GET https://api.planespotters.net/pub/photos/type/{typeCode}
 *
 * We cache positive hits for 30 days and negative hits for 7 days. The cache
 * is the `aircraft_photos` Prisma table keyed by "reg:X" / "icao24:X" /
 * "type:X".
 */

const CACHE_TTL_FOUND_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_TTL_NOTFOUND_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

export type PlanespottersPhoto = {
  photoUrl: string;
  thumbUrl: string | null;
  photographer: string | null;
  attributionUrl: string | null;
};

type RawResponse = {
  photos?: Array<{
    id?: string;
    thumbnail?: { src?: string };
    thumbnail_large?: { src?: string };
    photographer?: string;
    link?: string;
  }>;
};

export async function getPhotoForAircraft({
  registration,
  icao24,
  typeCode,
}: {
  registration?: string | null;
  icao24?: string | null;
  typeCode?: string | null;
}): Promise<PlanespottersPhoto | null> {
  // Priority: registration > icao24 > typeCode.
  if (registration) {
    const hit = await fetchAndCache("reg", registration.toUpperCase(),
      `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`);
    if (hit) return hit;
  }
  if (icao24) {
    const hit = await fetchAndCache("icao24", icao24.toLowerCase(),
      `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(icao24)}`);
    if (hit) return hit;
  }
  if (typeCode) {
    const hit = await fetchAndCache("type", typeCode.toUpperCase(),
      `https://api.planespotters.net/pub/photos/type/${encodeURIComponent(typeCode)}`);
    if (hit) return hit;
  }
  return null;
}

async function fetchAndCache(
  prefix: "reg" | "icao24" | "type",
  value: string,
  url: string,
): Promise<PlanespottersPhoto | null> {
  const key = `${prefix}:${value}`;

  const cached = await prisma.aircraftPhoto.findUnique({ where: { key } });
  if (cached) {
    const age = Date.now() - cached.fetchedAt.getTime();
    const ttl = cached.notFound ? CACHE_TTL_NOTFOUND_MS : CACHE_TTL_FOUND_MS;
    if (age < ttl) {
      if (cached.notFound) return null;
      return cached.photoUrl
        ? {
            photoUrl: cached.photoUrl,
            thumbUrl: cached.thumbUrl,
            photographer: cached.photographer,
            attributionUrl: cached.attributionUrl,
          }
        : null;
    }
  }

  const fresh = await fetchFromPlanespotters(url);

  await prisma.aircraftPhoto.upsert({
    where: { key },
    create: {
      key,
      photoUrl: fresh?.photoUrl ?? null,
      thumbUrl: fresh?.thumbUrl ?? null,
      photographer: fresh?.photographer ?? null,
      attributionUrl: fresh?.attributionUrl ?? null,
      notFound: fresh === null,
    },
    update: {
      photoUrl: fresh?.photoUrl ?? null,
      thumbUrl: fresh?.thumbUrl ?? null,
      photographer: fresh?.photographer ?? null,
      attributionUrl: fresh?.attributionUrl ?? null,
      notFound: fresh === null,
      fetchedAt: new Date(),
    },
  });

  return fresh;
}

async function fetchFromPlanespotters(url: string): Promise<PlanespottersPhoto | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Aloft/0.1 (personal flight log)" },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as RawResponse;
    const first = data.photos?.[0];
    if (!first) return null;
    // Planespotters' thumbnail_large.src is ~800px wide; thumbnail.src is ~200px.
    const large = first.thumbnail_large?.src ?? null;
    const small = first.thumbnail?.src ?? null;
    if (!large && !small) return null;
    return {
      photoUrl: large ?? small ?? "",
      thumbUrl: small,
      photographer: first.photographer ?? null,
      attributionUrl: first.link ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
