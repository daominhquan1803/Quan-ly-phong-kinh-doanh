import { auth } from "@/lib/auth";
import { TargetsTable } from "@/components/targets/TargetsTable";
import { PoValueTrendTable } from "@/components/targets/PoValueTrendTable";
import { SalesPlanDetailSection } from "@/components/targets/SalesPlanDetailSection";

export default async function TargetsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  return (
    <div className="space-y-10">
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">Kế hoạch kinh doanh</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Chỉ tiêu doanh số theo tháng — lấy từ file kế hoạch chi tiết đã nhập bên dưới"
              : "Chỉ tiêu và kết quả thực hiện của bạn"}
          </p>
        </div>
        <TargetsTable />
      </div>

      <PoValueTrendTable />

      <SalesPlanDetailSection isAdmin={isAdmin} />
    </div>
  );
}
