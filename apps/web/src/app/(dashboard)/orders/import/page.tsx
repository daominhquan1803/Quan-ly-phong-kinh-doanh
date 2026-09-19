import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ImportWizard } from "@/components/orders/ImportWizard";
import { UploadCloud } from "lucide-react";
import Link from "next/link";

export default async function OrdersImportPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/orders");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
          <Link href="/orders" className="hover:text-amber-400 transition-colors">
            ← Danh sách đơn hàng
          </Link>
          <span>/</span>
          <span className="text-amber-400">Import Excel AMIS</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Nhập Đơn Hàng Từ Excel (AMIS)</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Xuất file dữ liệu đơn hàng từ AMIS CRM rồi tải lên tại đây để đồng bộ nhanh vào hệ thống
            </p>
          </div>
        </div>
      </div>
      <ImportWizard />
    </div>
  );
}

