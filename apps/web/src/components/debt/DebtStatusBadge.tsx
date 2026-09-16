import { cn } from "@/lib/utils";
import { DebtStatus, DEBT_STATUS_LABEL } from "@/lib/debt-status";

const STATUS_CLASS: Record<DebtStatus, string> = {
  BAD_DEBT: "status-badge--bad-debt",
  OVERDUE: "status-badge--overdue",
  DUE_SOON: "status-badge--producing",
  CURRENT: "status-badge--delivered",
  NO_DUE_DATE: "status-badge--draft",
  PAID: "status-badge--delivered",
};

export function DebtStatusBadge({ status }: { status: DebtStatus }) {
  return <span className={cn("status-badge", STATUS_CLASS[status])}>{DEBT_STATUS_LABEL[status]}</span>;
}
