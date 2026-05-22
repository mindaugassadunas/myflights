import WorldMap from "@/components/map/world-map-loader";
import { ApiError, requireOwner } from "@/lib/session";
import { getMapFlightFeatureCollection } from "@/lib/map-flights";

export const metadata = { title: "Aloft" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const owner = await requireOwner();
    const initialData = await getMapFlightFeatureCollection(owner.id);
    return <WorldMap initialData={initialData} />;
  } catch (err) {
    const initialError =
      err instanceof ApiError && err.status === 401
        ? "Sign in to load your flights."
        : (err as Error).message;
    return <WorldMap initialError={initialError} />;
  }
}
