import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";

const STATUS_CONFIG: Record<
  string,
  { badge: string; dot: string }
> = {
  NEW: {
    badge: "bg-gray-100 text-gray-400 border-gray-200/70",
    dot: "bg-gray-400",
  },
  CONFIRMED: {
    badge: "bg-info-500/10 text-info-500 border-info-500/30 shadow-[0_0_8px_rgba(91,141,239,0.15)]",
    dot: "bg-info-500 shadow-[0_0_6px_rgba(91,141,239,0.8)]",
  },
  PRODUCING: {
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(224,163,39,0.15)]",
    dot: "bg-amber-500 shadow-[0_0_6px_rgba(224,163,39,0.8)]",
  },
  PARTIAL_DELIVERED: {
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_8px_rgba(59,130,246,0.15)]",
    dot: "bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]",
  },
  DELIVERED: {
    badge: "bg-success-600/10 text-success-600 border-success-600/30 shadow-[0_0_8px_rgba(34,179,120,0.15)]",
    dot: "bg-success-600 shadow-[0_0_6px_rgba(34,179,120,0.8)]",
  },
  CANCELLED: {
    badge: "bg-gray-200/50 text-muted2 border-gray-200/50 line-through",
    dot: "bg-muted2",
  },
};

export function OrderStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-brandRed-50 text-brandRed-600 border-brandRed-600/30 shadow-[0_0_10px_rgba(200,16,46,0.2)] animate-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-brandRed-600 shadow-[0_0_6px_#C8102E]"></span>
        Quá hạn giao
      </span>
    );
  }

  const config = STATUS_CONFIG[status] ?? {
    badge: "bg-gray-100 text-gray-400 border-gray-200/70",
    dot: "bg-gray-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border backdrop-blur-sm",
        config.badge
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)}></span>
      {ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL] ?? status}
    </span>
  );
}
