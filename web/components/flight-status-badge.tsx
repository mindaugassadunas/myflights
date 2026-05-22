import { cn } from "@/lib/utils";

type Status = "pending" | "resolved" | "no_coverage" | "ambiguous" | "failed";

const LABEL: Record<Status, string> = {
  pending: "pending",
  resolved: "tracked",
  no_coverage: "no ADS-B",
  ambiguous: "ambiguous",
  failed: "failed",
};

const CLASS: Record<Status, string> = {
  pending: "text-text-secondary border-border bg-surface",
  resolved: "text-success border-success/40 bg-success/10",
  no_coverage: "text-warning border-warning/40 bg-warning/10",
  ambiguous: "text-warning border-warning/40 bg-warning/10",
  failed: "text-danger border-danger/40 bg-danger/10",
};

export function FlightStatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 h-6 rounded-[4px] border",
        "text-[11px] font-mono-data uppercase tracking-wider",
        CLASS[status],
      )}
    >
      {LABEL[status]}
    </span>
  );
}
