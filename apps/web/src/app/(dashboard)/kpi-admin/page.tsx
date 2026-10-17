import { auth } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/rbac";
import { KpiAdminPage } from "@/components/kpi-admin/KpiAdminPage";
import { ClipboardCheck } from "lucide-react";

export default async function KpiAdminRoute() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-white/10 pb-5">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">KPI Admin kinh doanh</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isAdmin
              ? "Điểm tháng (100đ) và điểm tuần — tự tính từ dữ liệu app; giao trễ cần lý do được trưởng phòng duyệt; hoá đơn điều chỉnh cần gán nguyên nhân"
              : "Chấm mức hài lòng về hỗ trợ của Admin kinh doanh trong tháng (1–5 sao)"}
          </p>
        </div>
      </div>
      <KpiAdminPage
        isAdmin={isAdmin}
        canEdit={isAdmin && session?.user?.accessLevel !== "VIEWER"}
        isSystem={isSystemAdmin(session)}
        canRate={session?.user?.role === "SALES"}
      />
    </div>
  );
}
