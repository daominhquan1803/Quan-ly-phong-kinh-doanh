import { PickingSlipWizard } from "@/components/picking-slips/PickingSlipWizard";
import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";

export default function NewPickingSlipPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
          <Link href="/picking-slips" className="hover:text-amber-400 transition-colors">
            ← Danh sách phiếu soạn hàng
          </Link>
          <span>/</span>
          <span className="text-amber-400">Tạo mới</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Tạo Phiếu Soạn Hàng</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Bước 1: Chọn khách hàng • Bước 2: Tích chọn các mã hàng còn chưa giao, nhập số lượng cần soạn và ngày giao hàng
            </p>
          </div>
        </div>
      </div>
      <PickingSlipWizard />
    </div>
  );
}

