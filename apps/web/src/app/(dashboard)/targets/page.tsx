import { auth } from "@/lib/auth";
import { TargetsTable } from "@/components/targets/TargetsTable";
import { SalesPlanDetailSection } from "@/components/targets/SalesPlanDetailSection";

export default async function TargetsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  return (
    <div className="space-y-10">
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Kế hoạch kinh doanh</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? "Thiết lập chỉ tiêu doanh số theo tháng cho từng nhân viên" : "Chỉ tiêu và kết quả thực hiện của bạn"}
          </p>
        </div>
        <TargetsTable isAdmin={isAdmin} />
      </div>

      <SalesPlanDetailSection isAdmin={isAdmin} />
    </div>
  );
}
