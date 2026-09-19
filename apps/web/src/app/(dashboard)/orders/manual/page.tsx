import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ManualOrderWizard } from "@/components/orders/ManualOrderWizard";
import { FilePlus2 } from "lucide-react";
import Link from "next/link";

export default async function ManualOrderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
          <Link href="/orders" className="hover:text-amber-400 transition-colors">
            ← Danh sách đơn hàng
          </Link>
          <span>/</span>
          <span className="text-amber-400">Tạo đơn thủ công</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <FilePlus2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Thêm Đơn Hàng Thủ Công</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload file Excel &quot;Đơn đặt hàng&quot; (1 file = 1 đơn) — giải pháp nhanh khi khách vừa gửi PO mà chưa kịp đồng bộ AMIS
            </p>
          </div>
        </div>
      </div>
      <ManualOrderWizard isAdmin={session.user.role === "ADMIN"} />
    </div>
  );
}

