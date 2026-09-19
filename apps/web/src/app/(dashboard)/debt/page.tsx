import { auth } from "@/lib/auth";
import { DebtDashboard } from "@/components/debt/DebtDashboard";
import { DollarSign } from "lucide-react";

export default async function DebtPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(224,163,39,0.25)]">
          <DollarSign className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Sổ Quản Lý Công Nợ</h1>
          <p className="text-xs text-muted2">Theo dõi hạn nợ, dòng tiền về thực tế, nhắc nợ khách hàng và kế hoạch thu hồi</p>
        </div>
      </div>
      <DebtDashboard isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}

