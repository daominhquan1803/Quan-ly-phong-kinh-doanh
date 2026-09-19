import { cn } from "@/lib/utils";
import { DebtStatus, DEBT_STATUS_LABEL } from "@/lib/debt-status";

const STATUS_CONFIG: Record<
  DebtStatus,
  { badge: string; dot: string; pulse?: boolean }
> = {
  BAD_DEBT: {
    badge: "bg-brandRed-500/15 text-alert border-brandRed-500/30 shadow-[0_0_8px_rgba(200,16,46,0.2)]",
    dot: "bg-brandRed-500 shadow-[0_0_6px_#C8102E]",
    pulse: true,
  },
  OVERDUE: {
    badge: "bg-brandRed-500/10 text-alert border-brandRed-500/25",
    dot: "bg-brandRed-400 shadow-[0_0_5px_rgba(200,16,46,0.6)]",
  },
  DUE_SOON: {
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(224,163,39,0.15)]",
    dot: "bg-amber-400 shadow-[0_0_6px_rgba(224,163,39,0.8)]",
  },
  CURRENT: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]",
    dot: "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]",
  },
  NO_DUE_DATE: {
    badge: "bg-white/5 text-gray-400 border-white/10",
    dot: "bg-gray-400",
  },
  PAID: {
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]",
    dot: "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]",
  },
};

export function DebtStatusBadge({ status }: { status: DebtStatus }) {
  const config = STATUS_CONFIG[status] ?? {
    badge: "bg-white/5 text-gray-400 border-white/10",
    dot: "bg-gray-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border backdrop-blur-sm",
        config.badge,
        config.pulse && "animate-pulse"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)}></span>
      {DEBT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

