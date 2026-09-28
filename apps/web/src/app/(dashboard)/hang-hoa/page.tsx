import { ItemsPanel } from "@/components/items/ItemsPanel";
import { Package } from "lucide-react";

export default function ItemsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Hàng Hóa</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Mã hàng đồng bộ từ AMIS qua đơn hàng — lọc theo mã hàng, tên hàng, khách hàng
            </p>
          </div>
        </div>
      </div>
      <ItemsPanel />
    </div>
  );
}
