import { auth } from "@/lib/auth";
import { DebtReminderHistoryPanel } from "@/components/debt/DebtReminderHistoryPanel";
import { Mail } from "lucide-react";

export default async function DebtRemindersPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(224,163,39,0.25)]">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Lịch sử thư nhắc công nợ</h1>
          <p className="text-xs text-muted2">Các thư nhắc lịch thanh toán đã gửi cho khách hàng (trước hạn 7 ngày và vừa quá hạn)</p>
        </div>
      </div>
      <DebtReminderHistoryPanel isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}
