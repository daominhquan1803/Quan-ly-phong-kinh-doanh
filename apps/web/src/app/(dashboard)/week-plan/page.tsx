import { auth } from "@/lib/auth";
import { WeekPlanOverview } from "@/components/week-plan/WeekPlanOverview";

export default async function WeekPlanPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Kế hoạch làm việc tuần</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Giao chỉ tiêu tuần cho từng nhân viên và theo dõi tiến độ thực hiện"
            : "Chỉ tiêu tuần của bạn và kết quả đã ghi nhận"}
        </p>
      </div>
      <WeekPlanOverview isAdmin={isAdmin} />
    </div>
  );
}
