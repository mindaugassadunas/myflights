"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map as MapIcon, ListOrdered, BarChart3, MoreHorizontal, Plus } from "lucide-react";
import { openAddFlight } from "@/lib/add-flight-store";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const TABS_LEFT: Tab[] = [
  { href: "/", label: "Map", icon: MapIcon },
  { href: "/log", label: "Log", icon: ListOrdered },
];

const TABS_RIGHT: Tab[] = [
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

/**
 * Mobile bottom tab bar + center FAB. Hidden at lg+; a left sidebar takes
 * over (see SideNav). Tabs hide on detail screens via the `data-no-tabs`
 * body attribute pattern — flight detail pages set it in their layout.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: bottom tabs */}
      <nav
        aria-label="Primary"
        className={cn(
          "lg:hidden fixed bottom-0 inset-x-0 z-30",
          "bg-bg/95 backdrop-blur-md border-t border-border",
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <div className="relative h-16 grid grid-cols-5 items-stretch">
          {TABS_LEFT.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
          ))}
          <div className="flex items-center justify-center">
            <FabButton />
          </div>
          {TABS_RIGHT.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
          ))}
        </div>
      </nav>

      {/* Desktop: left sidebar */}
      <SideNav pathname={pathname} />
    </>
  );
}

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[11px]",
        active ? "text-accent" : "text-text-secondary active:text-text-primary",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5} />
      <span className="font-medium tracking-wide">{tab.label}</span>
    </Link>
  );
}

function FabButton() {
  // Opens the global AddFlightSheet without a Next.js soft-nav, so the
  // current `force-dynamic` page doesn't re-run its server query on tap.
  return (
    <button
      type="button"
      onClick={openAddFlight}
      aria-label="Add flight"
      className={cn(
        "h-12 w-12 rounded-full",
        "bg-accent text-bg",
        "flex items-center justify-center",
        "shadow-[0_4px_16px_rgba(0,212,255,0.4)]",
        "active:scale-95 transition-transform",
      )}
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}

function SideNav({ pathname }: { pathname: string | null }) {
  const before = [
    { href: "/", label: "Map", icon: MapIcon },
    { href: "/log", label: "Log", icon: ListOrdered },
  ];
  const after = [
    { href: "/stats", label: "Stats", icon: BarChart3 },
    { href: "/more", label: "More", icon: MoreHorizontal },
  ];
  const rowCls =
    "flex items-center gap-3 px-3 h-11 rounded-[8px] text-[16px] w-full text-left";
  const renderLink = ({ href, label, icon: Icon }: typeof before[number]) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          rowCls,
          active
            ? "bg-surface text-accent"
            : "text-text-secondary hover:bg-surface hover:text-text-primary",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5} />
        <span>{label}</span>
      </Link>
    );
  };
  return (
    <aside
      className={cn(
        "hidden lg:flex fixed inset-y-0 left-0 z-30 w-64",
        "bg-bg border-r border-border flex-col",
      )}
    >
      <div className="px-5 py-6">
        <div className="text-[14px] font-mono-data uppercase tracking-wider text-text-secondary">
          Aloft
        </div>
        <div className="text-[20px] font-light mt-0.5">Personal flight log</div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {before.map(renderLink)}
        <button
          type="button"
          onClick={openAddFlight}
          className={cn(
            rowCls,
            "text-text-secondary hover:bg-surface hover:text-text-primary",
          )}
        >
          <Plus className="h-5 w-5" strokeWidth={1.5} />
          <span>Add flight</span>
        </button>
        {after.map(renderLink)}
      </nav>
    </aside>
  );
}
