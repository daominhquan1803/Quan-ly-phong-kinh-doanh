import { auth } from "@/lib/auth";
import { TargetsTable } from "@/components/targets/TargetsTable";
import { PoValueTrendTable } from "@/components/targets/PoValueTrendTable";
import { RevenueTrendTable } from "@/components/targets/RevenueTrendTable";
import { SalesPlanDetailSection } from "@/components/targets/SalesPlanDetailSection";
import { Target } from "lucide-react";

export default async function TargetsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  return (
    <div className="space-y-10">
      <div>
        <div className="mb-6 flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(224,163,39,0.25)]">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink tracking-tight">Kế Hoạch &amp; Mục Tiêu Doanh Số</h1>
            <p className="text-xs text-muted2">
              {isAdmin
                ? "Chỉ tiêu doanh số theo tháng — lấy từ file kế hoạch chi tiết đã nhập bên dưới"
                : "Chỉ tiêu và kết quả thực hiện của bạn"}
            </p>
          </div>
        </div>
        <TargetsTable />
      </div>


      <PoValueTrendTable />

      <RevenueTrendTable />

      <SalesPlanDetailSection isAdmin={isAdmin} />
    </div>
  );
}
