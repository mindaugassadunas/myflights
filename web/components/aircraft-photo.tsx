import type { PlanespottersPhoto } from "@/lib/planespotters";

/**
 * Hero photo + attribution caption. Server-renders; the photo URL is a
 * Planespotters CDN URL we display via a plain <img> (no Next.js image
 * loader — Planespotters doesn't accept transformations). Attribution is
 * mandatory per their terms.
 */
export function AircraftPhoto({
  photo,
  fallback,
}: {
  photo: PlanespottersPhoto | null;
  fallback: string;
}) {
  if (!photo?.photoUrl) {
    return (
      <div className="aspect-[16/9] w-full bg-surface border border-border rounded-[2px] flex items-center justify-center text-text-secondary text-[14px]">
        {fallback}
      </div>
    );
  }
  return (
    <figure className="relative">
      <img
        src={photo.photoUrl}
        alt="Aircraft"
        className="w-full aspect-[16/9] object-cover rounded-[2px] border border-border bg-surface"
        loading="lazy"
      />
      <figcaption className="mt-1 text-[11px] font-mono-data text-text-secondary text-right">
        Photo:{" "}
        {photo.photographer && photo.attributionUrl ? (
          <a
            href={photo.attributionUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-text-primary"
          >
            {photo.photographer}
          </a>
        ) : (
          photo.photographer ?? "Planespotters.net"
        )}{" "}
        · Planespotters.net
      </figcaption>
    </figure>
  );
}
