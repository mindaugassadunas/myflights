import Link from "next/link";
import { LogOut } from "lucide-react";
import { isAuthDisabled } from "@/lib/owner";

export const metadata = { title: "More — Aloft" };
export const dynamic = "force-dynamic";

const AUTH_DISABLED = isAuthDisabled();

const ITEMS = [
  { href: "/aircraft", label: "Aircraft", hint: "Airframes you've flown more than once" },
  { href: "/trips", label: "Trips", hint: "Auto-clustered groups of flights" },
  { href: "/more/import", label: "Gmail import", hint: "Backfill from your inbox" },
  { href: "/more/export", label: "Export", hint: "KML, GeoJSON, CSV, iCal" },
  { href: "/more/credits", label: "OpenSky credits", hint: "Daily budget & usage" },
  { href: "/styleguide", label: "Styleguide", hint: "Design tokens" },
];

async function signOutAction() {
  "use server";
  // In dev (NEXTAUTH_SECRET unset) there's no real session to clear, so we
  // just redirect to /login — the lazy import is skipped because calling
  // signOut() against a stubbed auth instance would error.
  const { isAuthDisabled } = await import("@/lib/owner");
  if (isAuthDisabled()) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/login" });
}

export default function MorePage() {
  return (
    <div className="px-5 py-6 pt-[calc(env(safe-area-inset-top)+16px)]">
      <h1 className="text-[22px] leading-7 font-light">More</h1>
      <div className="mt-6 divide-y divide-border border border-border rounded-[2px] bg-surface">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center justify-between px-5 h-14 active:bg-surface-elevated"
          >
            <div>
              <div className="text-[16px]">{it.label}</div>
              <div className="text-[13px] text-text-secondary">{it.hint}</div>
            </div>
            <div className="text-text-secondary">›</div>
          </Link>
        ))}
      </div>

      <form action={signOutAction} className="mt-6">
        <button
          type="submit"
          className="w-full flex items-center justify-between px-5 h-14 border border-border rounded-[2px] bg-surface active:bg-surface-elevated text-danger"
        >
          <span className="text-[16px]">
            Sign out{AUTH_DISABLED ? " · dev mode" : ""}
          </span>
          <LogOut className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </form>
    </div>
  );
}
