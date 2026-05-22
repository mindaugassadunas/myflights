"use client";

import * as React from "react";
import {
  addMonths,
  addYears,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Custom date picker matching the Dark Precision aesthetic. Replaces the
 * native `<input type="date">` for the in-sheet add-flight flow — the OS
 * picker pulled the user out of the form context, so we render an inline
 * calendar that lives inside the same Vaul sheet.
 *
 * Trigger is a tappable field; tapping expands a Monday-start month grid
 * below. Picking a day collapses the calendar and fires onChange.
 *
 * `value`/`onChange` use ISO "YYYY-MM-DD" strings and treat dates as UTC
 * midnight, matching the rest of the app's flight-date convention.
 */
export function DatePicker({
  value,
  onChange,
  label,
  className,
}: {
  value: string;           // YYYY-MM-DD
  onChange: (next: string) => void;
  label?: string;
  className?: string;
}) {
  const selected = React.useMemo(() => parseIsoDate(value) ?? new Date(), [value]);
  const [expanded, setExpanded] = React.useState(false);
  const [view, setView] = React.useState<Date>(startOfMonth(selected));

  React.useEffect(() => {
    setView(startOfMonth(selected));
  }, [selected]);

  const pick = (d: Date) => {
    onChange(formatIsoDate(d));
    setExpanded(false);
  };

  const triggerLabel = format(selected, "EEE d MMM yyyy");

  return (
    <div className={className}>
      {label && (
        <label className="block text-[12px] font-mono-data uppercase tracking-wider text-text-secondary mb-1.5">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          "w-full h-12 px-3 rounded-[8px] bg-surface border text-left",
          "text-[16px] font-mono-data flex items-center justify-between gap-2",
          "focus:outline-none",
          expanded ? "border-accent" : "border-border",
        )}
      >
        <span>{triggerLabel}</span>
        <CalendarIcon className="h-4 w-4 text-text-secondary" />
      </button>

      {expanded && (
        <div className="mt-2 rounded-[8px] border border-border bg-surface overflow-hidden">
          <CalendarHeader view={view} onView={setView} />
          <CalendarGrid view={view} selected={selected} onPick={pick} />
        </div>
      )}
    </div>
  );
}

function CalendarHeader({
  view,
  onView,
}: {
  view: Date;
  onView: (next: Date) => void;
}) {
  const monthLabel = format(view, "MMMM yyyy");
  return (
    <div className="flex items-center justify-between px-2 py-2 border-b border-border">
      <div className="flex items-center gap-1">
        <NavButton
          aria-label="Previous year"
          onClick={() => onView(startOfMonth(subYears(view, 1)))}
        >
          <ChevronLeft className="h-4 w-4" />
          <ChevronLeft className="h-4 w-4 -ml-2.5" />
        </NavButton>
        <NavButton
          aria-label="Previous month"
          onClick={() => onView(startOfMonth(subMonths(view, 1)))}
        >
          <ChevronLeft className="h-4 w-4" />
        </NavButton>
      </div>
      <div className="text-[14px] font-mono-data">{monthLabel}</div>
      <div className="flex items-center gap-1">
        <NavButton
          aria-label="Next month"
          onClick={() => onView(startOfMonth(addMonths(view, 1)))}
        >
          <ChevronRight className="h-4 w-4" />
        </NavButton>
        <NavButton
          aria-label="Next year"
          onClick={() => onView(startOfMonth(addYears(view, 1)))}
        >
          <ChevronRight className="h-4 w-4" />
          <ChevronRight className="h-4 w-4 -ml-2.5" />
        </NavButton>
      </div>
    </div>
  );
}

function NavButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "h-9 min-w-9 px-1.5 rounded-[6px]",
        "flex items-center justify-center",
        "text-text-secondary active:bg-surface-elevated active:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function CalendarGrid({
  view,
  selected,
  onPick,
}: {
  view: Date;
  selected: Date;
  onPick: (d: Date) => void;
}) {
  const days = React.useMemo(() => buildMonthGrid(view), [view]);

  return (
    <div className="p-2">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="h-8 flex items-center justify-center text-[11px] font-mono-data uppercase tracking-wider text-text-secondary"
          >
            {w}
          </div>
        ))}
        {days.map((d) => {
          const inMonth = isSameMonth(d, view);
          const isSelected = isSameDay(d, selected);
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={isSelected}
              aria-label={format(d, "EEEE d MMMM yyyy")}
              className={cn(
                "h-11 flex items-center justify-center rounded-[6px]",
                "text-[15px] font-mono-data",
                "active:bg-surface-elevated",
                isSelected
                  ? "bg-accent text-bg"
                  : inMonth
                    ? "text-text-primary"
                    : "text-text-secondary/40",
                !isSelected && today && "ring-1 ring-accent/60",
              )}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Build a 6-row × 7-col grid of Date objects covering the view month,
// Monday-first, padded with leading/trailing days from neighbouring months.
function buildMonthGrid(view: Date): Date[] {
  const start = startOfWeek(startOfMonth(view), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(view), { weekStartsOn: 1 });
  const out: Date[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  // Always render 6 rows so the calendar doesn't reflow when months span
  // 4 vs 5 vs 6 weeks.
  while (out.length < 42) {
    const last = out[out.length - 1];
    out.push(new Date(last.getTime() + 24 * 60 * 60 * 1000));
  }
  return out.slice(0, 42);
}

function parseIsoDate(s: string): Date | null {
  // Treat YYYY-MM-DD as a local-midnight calendar date — flights are
  // stored at UTC midnight server-side, but for picker display we want
  // "today" to match the user's wall calendar.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
