"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AirportInput, type AirportPick } from "@/components/airport-input";
import { DatePicker } from "@/components/date-picker";
import { closeAddFlight, useAddFlightOpen } from "@/lib/add-flight-store";
import { cn } from "@/lib/utils";

type Step = 1 | 2;
type Mode = "flightNumber" | "tail";
type LookupStatus = "idle" | "loading" | "ok" | "not_found" | "error";

type FormState = {
  dep: AirportPick | null;
  arr: AirportPick | null;
  date: string;     // YYYY-MM-DD
  callsign: string;
  registration: string;
  // Scheduled times from AeroDataBox, when auto-lookup succeeded. The
  // server uses these to seed durationMin so no_coverage flights still
  // have a displayed duration.
  scheduledDepUtc: string | null;
  scheduledArrUtc: string | null;
};

const EMPTY: FormState = {
  dep: null,
  arr: null,
  date: "",
  callsign: "",
  registration: "",
  scheduledDepUtc: null,
  scheduledArrUtc: null,
};

function emptyForm(): FormState {
  return {
    ...EMPTY,
    date: todayLocalIsoDate(),
  };
}

function todayLocalIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ScheduleLookupResponse = {
  flightNumber: string;
  callsign: string | null;
  airlineIata: string | null;
  airlineIcao: string | null;
  depAirport: AirportPick | null;
  arrAirport: AirportPick | null;
  aircraftModel: string | null;
  aircraftRegistration: string | null;
  scheduledDepUtc: string | null;
  scheduledArrUtc: string | null;
};

/**
 * Global add-flight sheet, mounted in the layout. Open state is driven by
 * the local add-flight-store (not Next.js routing) so tapping the FAB
 * doesn't trigger a soft-nav re-render of the current `force-dynamic`
 * page. The store mirrors itself to `?add=1` via history.replaceState so
 * deep-linking from `/add` and browser-back-to-close still work.
 */
export function AddFlightSheet() {
  const open = useAddFlightOpen();
  const router = useRouter();

  return (
    <Sheet
      open={open}
      repositionInputs={false}
      onOpenChange={(o) => { if (!o) closeAddFlight(); }}
    >
      <SheetContent className="h-[92dvh]">
        <AddFlightWizard
          open={open}
          onSubmitted={(id) => {
            closeAddFlight();
            router.replace(`/flights/${id}`);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function AddFlightWizard({
  open,
  onSubmitted,
}: {
  open: boolean;
  onSubmitted: (id: string) => void;
}) {
  const [step, setStep] = React.useState<Step>(1);
  const [mode, setMode] = React.useState<Mode>("flightNumber");
  const [form, setForm] = React.useState<FormState>(() => emptyForm());
  const [lookup, setLookup] = React.useState<LookupStatus>("idle");
  const [lookupNote, setLookupNote] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setMode("flightNumber");
    setForm(emptyForm());
    setLookup("idle");
    setLookupNote(null);
    setSubmitting(false);
    setError(null);
  }, [open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const canAdvance1 =
    Boolean(form.date) &&
    (mode === "flightNumber"
      ? form.callsign.trim().length >= 2
      : form.registration.trim().length >= 2);

  const canSubmitStep2 = Boolean(form.dep && form.arr && form.dep.id !== form.arr.id);

  // Persist a flight to the backend. Called from step 1 after a successful
  // auto-resolve, or from step 2 once the user has picked the route by hand.
  const persist = React.useCallback(
    async (next: FormState) => {
      setError(null);
      setSubmitting(true);
      try {
        const resp = await fetch("/api/flights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: next.date,
            depAirport: next.dep?.iata ?? next.dep?.icao,
            arrAirport: next.arr?.iata ?? next.arr?.icao,
            callsign: next.callsign.trim() || undefined,
            registration: next.registration.trim() || undefined,
            scheduledDepUtc: next.scheduledDepUtc ?? undefined,
            scheduledArrUtc: next.scheduledArrUtc ?? undefined,
          }),
        });
        if (!resp.ok) {
          const payload = (await resp.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `error ${resp.status}`);
        }
        const flight = (await resp.json()) as { id: string };
        onSubmitted(flight.id);
      } catch (err) {
        setError((err as Error).message);
        setSubmitting(false);
      }
    },
    [onSubmitted],
  );

  // Step 1 → either auto-lookup-then-save (flight number) or jump to
  // manual route (tail / on lookup failure).
  const advanceFromStep1 = async () => {
    if (mode === "tail") {
      // Tail number can't be auto-resolved to a route without OpenSky and
      // we don't want to spend OpenSky credits on the form. Go straight to
      // manual route entry.
      setStep(2);
      return;
    }

    setLookup("loading");
    setLookupNote(null);
    try {
      const resp = await fetch("/api/flights/schedule-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flightNumber: form.callsign,
          date: form.date,
        }),
      });
      if (resp.status === 404) {
        setLookup("not_found");
        setLookupNote("Couldn't find this flight in the schedule. Enter the route manually.");
        setStep(2);
        return;
      }
      if (resp.status === 422) {
        // AeroDataBox's free tier only covers the last ~365 days. Older
        // flights (back-fills from history) need to be entered by hand.
        setLookup("not_found");
        setLookupNote(
          "This date is outside our schedule provider's coverage (last ~365 days). Enter the route manually.",
        );
        setStep(2);
        return;
      }
      if (!resp.ok) {
        const payload = (await resp.json().catch(() => ({}))) as { error?: string; detail?: string };
        setLookup("error");
        setLookupNote(
          payload.detail ?? payload.error ?? "Schedule lookup unavailable. Enter the route manually.",
        );
        setStep(2);
        return;
      }
      const data = (await resp.json()) as ScheduleLookupResponse;
      const dep = data.depAirport;
      const arr = data.arrAirport;
      if (!dep || !arr) {
        setLookup("not_found");
        setLookupNote(
          "Found the flight but one of the airports isn't in our database. Enter the route manually.",
        );
        setStep(2);
        return;
      }
      const next: FormState = {
        ...form,
        dep,
        arr,
        registration: form.registration || (data.aircraftRegistration ?? ""),
        scheduledDepUtc: data.scheduledDepUtc,
        scheduledArrUtc: data.scheduledArrUtc,
      };
      setForm(next);
      setLookup("ok");
      setLookupNote(null);
      await persist(next);
    } catch (err) {
      setLookup("error");
      setLookupNote((err as Error).message);
      setStep(2);
    }
  };

  const title =
    step === 1
      ? mode === "flightNumber"
        ? "Flight number"
        : "Tail number"
      : "Route";

  const busy = lookup === "loading" || submitting;
  const keepFocusedControlVisible = React.useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, textarea, select")) return;

      const scrollFocusedControl = () => {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      };

      requestAnimationFrame(scrollFocusedControl);
      window.setTimeout(scrollFocusedControl, 320);
    },
    [],
  );

  return (
    <div className="h-full flex flex-col" onFocusCapture={keepFocusedControlVisible}>
      <header className="px-5 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
            Step {step} of 2
          </div>
          <h2 className="text-[18px] leading-6">{title}</h2>
        </div>
        <StepDots step={step} />
      </header>

      <div className="flex-1 min-h-0 px-5 py-3 overflow-y-auto overscroll-contain scroll-pb-28">
        {step === 1 && (
          <div className="space-y-4">
            {mode === "flightNumber" ? (
              <Field label="Flight number · e.g. KL1772 or BT961">
                <input
                  value={form.callsign}
                  onChange={(e) => set("callsign", e.target.value.toUpperCase())}
                  placeholder="KL1772"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  className="w-full h-12 px-3 rounded-[8px] bg-surface border border-border text-[16px] font-mono-data focus:outline-none focus:border-accent"
                />
                <p className="mt-1 text-[12px] text-text-secondary">
                  We'll auto-resolve the route from your flight number and
                  date. For private flights or charters,{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("tail"); setLookup("idle"); setLookupNote(null); }}
                    className="underline text-accent"
                  >
                    use the tail number
                  </button>
                  {" "}or{" "}
                  <button
                    type="button"
                    onClick={() => { setLookup("idle"); setLookupNote(null); setStep(2); }}
                    className="underline text-accent"
                  >
                    enter the route manually
                  </button>
                  .
                </p>
              </Field>
            ) : (
              <Field label="Tail number · e.g. D-AIXP">
                <input
                  value={form.registration}
                  onChange={(e) => set("registration", e.target.value.toUpperCase())}
                  placeholder="D-AIXP"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  className="w-full h-12 px-3 rounded-[8px] bg-surface border border-border text-[16px] font-mono-data focus:outline-none focus:border-accent"
                />
                <p className="mt-1 text-[12px] text-text-secondary">
                  Tail numbers don't map to a unique route, so you'll enter
                  the route on the next step.{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("flightNumber"); }}
                    className="underline text-accent"
                  >
                    Switch back to flight number
                  </button>
                  .
                </p>
              </Field>
            )}

            <DatePicker
              label="Date"
              value={form.date}
              onChange={(v) => set("date", v)}
            />

            {lookup === "loading" && (
              <p className="text-[13px] text-text-secondary">Looking up route…</p>
            )}
            {error && (
              <p className="text-[13px] text-warning">{error}</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {lookupNote && (
              <p className="text-[13px] text-warning">{lookupNote}</p>
            )}
            <AirportInput
              label="From"
              value={form.dep}
              onChange={(v) => set("dep", v)}
              autoFocus
            />
            <AirportInput
              label="To"
              value={form.arr}
              onChange={(v) => set("arr", v)}
            />
            {form.dep && form.arr && form.dep.id === form.arr.id && (
              <p className="text-[13px] text-warning">Departure and arrival must differ.</p>
            )}
            {error && (
              <p className="text-[13px] text-warning">{error}</p>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 px-5 py-4 border-t border-border pb-[max(env(safe-area-inset-bottom),16px)] flex gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="h-12 px-5 rounded-[8px] border border-border text-text-primary"
            disabled={busy}
          >
            Back
          </button>
        ) : (
          <div className="w-0" />
        )}
        {step === 1 && (
          <button
            type="button"
            onClick={advanceFromStep1}
            disabled={!canAdvance1 || busy}
            className={cn(
              "flex-1 h-12 rounded-[8px] font-medium",
              "bg-accent text-bg disabled:opacity-40",
            )}
          >
            {lookup === "loading"
              ? "Looking up…"
              : submitting
                ? "Saving…"
                : mode === "flightNumber"
                  ? "Save flight"
                  : "Next"}
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            onClick={() => persist(form)}
            disabled={!canSubmitStep2 || busy}
            className={cn(
              "flex-1 h-12 rounded-[8px] font-medium",
              "bg-accent text-bg disabled:opacity-40",
            )}
          >
            {submitting ? "Saving…" : "Save flight"}
          </button>
        )}
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-mono-data uppercase tracking-wider text-text-secondary mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 w-5 rounded-full",
            i <= step ? "bg-accent" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}
