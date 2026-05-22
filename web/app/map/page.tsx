import { redirect } from "next/navigation";

// The map is now the homepage. Keep this route as a redirect so older
// links, the home-screen install, and shared URLs still land somewhere
// sensible.
export default function MapRedirect() {
  redirect("/");
}
