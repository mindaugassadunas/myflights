import { redirect } from "next/navigation";
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
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login");
    }
    return <WorldMap initialError={(err as Error).message} />;
  }
}
