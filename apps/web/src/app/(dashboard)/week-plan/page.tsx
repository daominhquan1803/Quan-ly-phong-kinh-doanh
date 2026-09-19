import { auth } from "@/lib/auth";
import { WeekPlanOverview } from "@/components/week-plan/WeekPlanOverview";
import { CalendarDays } from "lucide-react";

export default async function WeekPlanPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(224,163,39,0.25)]">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Kế Hoạch Làm Việc Tuần</h1>
          <p className="text-xs text-muted2">
            {isAdmin
              ? "Giao chỉ tiêu tuần cho từng nhân viên và theo dõi tiến độ thực hiện"
              : "Chỉ tiêu tuần của bạn và kết quả đã ghi nhận"}
          </p>
        </div>
      </div>
      <WeekPlanOverview isAdmin={isAdmin} />
    </div>
  );
}

