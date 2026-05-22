import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The add-flight UX is a sheet, not a standalone page — redirect into /log
// with the sheet opened so the user lands on something useful if they
// dismiss the sheet immediately.
export default function AddRedirect() {
  redirect("/log?add=1");
}
