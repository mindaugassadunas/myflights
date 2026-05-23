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
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Accepted input shapes when the user types directly. First match wins;
// list ordered by user expectation, not strictness.
const PARSE_FORMATS = [
  "yyyy-MM-dd",   // 2026-05-23 (canonical)
  "yyyy-M-d",     // 2026-5-3
  "d MMM yyyy",   // 23 May 2026
  "d MMM yy",     // 23 May 26
  "d MMMM yyyy",
  "dd/MM/yyyy",
  "d/M/yyyy",
  "dd.MM.yyyy",
  "d.M.yyyy",
];

const DISPLAY_FORMAT = "yyyy-MM-dd";

function tryParseTyped(input: string): Date | null {
  const cleaned = input.trim();
  if (!cleaned) return null;
  for (const fmt of PARSE_FORMATS) {
    const d = parse(cleaned, fmt, new Date());
    if (isValid(d)) return d;
  }
  return null;
}

/**
 * Auto-mask `YYYY-MM-DD` as the user types. Strips non-digits, caps at
 * eight digits, then re-inserts hyphens between segments — adding a
 * *trailing* hyphen only while the user is typing forward, so after the
 * 4th digit the field reads "2026-" with the cursor ready for the
 * month. On backspace the trailing hyphen is allowed to disappear, so
 * the user isn't trapped.
 *
 * Only fires when the input looks like ISO-style typing (digits and
 * hyphens only). Other separators (slashes, dots, spelled-out months)
 * pass through untouched so the multi-format parser still recognises
 * pastes like "23/05/2026" or "May 23 2026".
 */
function autoMaskIsoDate(input: string, previous: string): string {
  if (!/^[\d-]*$/.test(input)) return input;
  const digits = input.replace(/\D/g, "").slice(0, 8);
  const typingForward = input.length > previous.length;
  if (digits.length < 4) return digits;
  if (digits.length === 4) {
    return typingForward ? `${digits}-` : digits;
  }
  if (digits.length < 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  if (digits.length === 6) {
    return typingForward
      ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-`
      : `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

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
  autoFocus,
}: {
  value: string;           // YYYY-MM-DD
  onChange: (next: string) => void;
  label?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const selected = React.useMemo(() => parseIsoDate(value) ?? new Date(), [value]);
  // When the field is auto-focused on modal open, also show the calendar
  // so the user has both input modes (typing + tapping a day) immediately
  // visible.
  const [expanded, setExpanded] = React.useState(Boolean(autoFocus));
  const [view, setView] = React.useState<Date>(startOfMonth(selected));
  // `draft` is the user's in-progress text while the input is focused.
  // null means "not actively typing — show the canonical formatted value".
  const [draft, setDraft] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setView(startOfMonth(selected));
  }, [selected]);

  // Focus + select-all on first mount when requested. Selecting the
  // pre-filled date lets the user immediately overtype it without having
  // to manually clear the field first.
  React.useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    // Intentionally fire-once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitDate = (d: Date) => {
    onChange(formatIsoDate(d));
  };

  const pick = (d: Date) => {
    commitDate(d);
    setExpanded(false);
    setDraft(null);
  };

  const displayValue = draft ?? format(selected, DISPLAY_FORMAT);

  return (
    <div className={className}>
      {label && (
        <label className="block text-[12px] font-mono-data uppercase tracking-wider text-text-secondary mb-1.5">
          {label}
        </label>
      )}
      <div
        className={cn(
          "w-full h-12 px-3 rounded-[8px] bg-surface border",
          "flex items-center gap-2",
          "focus-within:border-accent",
          expanded ? "border-accent" : "border-border",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            const previous = displayValue;
            const masked = autoMaskIsoDate(e.target.value, previous);
            setDraft(masked);
            const parsed = tryParseTyped(masked);
            if (parsed) {
              commitDate(parsed);
            }
          }}
          onFocus={() => {
            // Move the canonical value into the editable draft so the
            // input is immediately editable without first highlighting.
            setDraft(format(selected, DISPLAY_FORMAT));
          }}
          onBlur={() => {
            // Drop any unparseable typing; the canonical value flows
            // back in via `displayValue` when draft is null.
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const parsed = tryParseTyped(displayValue);
              if (parsed) {
                commitDate(parsed);
                setDraft(null);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }
            if (e.key === "Escape") {
              setDraft(null);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder="2026-05-23"
          inputMode="numeric"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="flex-1 bg-transparent text-[16px] font-mono-data outline-none placeholder:text-text-secondary/50"
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide calendar" : "Show calendar"}
          className={cn(
            "h-8 w-8 -mr-1 rounded-[6px] flex items-center justify-center",
            expanded ? "text-accent" : "text-text-secondary",
            "active:bg-surface-elevated",
          )}
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
      </div>

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
