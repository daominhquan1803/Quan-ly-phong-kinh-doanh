import { auth } from "@/lib/auth";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

export default async function DashboardPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Tổng quan</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
              {isAdmin ? "Trung tâm điều phối" : "Bàn làm việc NVKD"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isAdmin
              ? "Kế hoạch kinh doanh, đơn hàng quá hạn và công nợ toàn phòng"
              : "Kế hoạch kinh doanh và đơn hàng quá hạn của bạn"}
          </p>
        </div>
      </div>
      <DashboardOverview isAdmin={isAdmin} />
    </div>
  );
}
