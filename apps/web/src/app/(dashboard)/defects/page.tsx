import { auth } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/rbac";
import { DefectsPage } from "@/components/defects/DefectsPage";
import { AlertTriangle } from "lucide-react";

export default async function DefectReportsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const canEdit = isAdmin && session?.user?.accessLevel !== "VIEWER";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-white/10 pb-5">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30 text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Báo cáo hàng lỗi</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isAdmin
              ? "Lập biên bản hàng lỗi theo số biên bản của công ty, ghi người chịu trách nhiệm (tính vào KPI tháng), đóng biên bản khi xử lý xong"
              : "Các biên bản hàng lỗi bạn chịu trách nhiệm — tính vào KPI tháng"}
          </p>
        </div>
      </div>
      <DefectsPage canEdit={canEdit} canManage={isSystemAdmin(session)} />
    </div>
  );
}
