import { CustomersPanel } from "@/components/customers/CustomersPanel";
import { Users, ShieldCheck } from "lucide-react";

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white">Quản Lý Khách Hàng</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <ShieldCheck className="h-3 w-3" /> Hồ Sơ Doanh Nghiệp
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Hồ sơ khách hàng, phân công NVKD phụ trách và quy chuẩn hạn nợ — tự động kích hoạt tính hạn trên Hub Công Nợ
            </p>
          </div>
        </div>
      </div>
      <CustomersPanel />
    </div>
  );
}

