import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";

const STATUS_CLASS: Record<string, string> = {
  NEW: "status-badge--draft",
  CONFIRMED: "status-badge--producing",
  PRODUCING: "status-badge--producing",
  PARTIAL_DELIVERED: "status-badge--producing",
  DELIVERED: "status-badge--delivered",
  CANCELLED: "status-badge--draft",
};

export function OrderStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) {
    return <span className={cn("status-badge status-badge--overdue")}>Quá hạn giao</span>;
  }
  return (
    <span className={cn("status-badge", STATUS_CLASS[status] ?? "status-badge--draft")}>
      {ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL] ?? status}
    </span>
  );
}
