import { auth } from "@/lib/auth";
import { ReportsTabs } from "@/components/reports/ReportsTabs";
import { FileBarChart } from "lucide-react";

export default async function ReportsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-white/10 pb-5">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
          <FileBarChart className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Báo cáo</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Báo cáo tuần / tháng ra Excel dashboard, và Thống kê khách hàng / mã hàng lâu chưa mua, hoá đơn theo khách
          </p>
        </div>
      </div>
      <ReportsTabs isAdmin={isAdmin} />
    </div>
  );
}
