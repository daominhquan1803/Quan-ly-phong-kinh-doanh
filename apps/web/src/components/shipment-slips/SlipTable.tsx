"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatDateVN } from "@/lib/utils";
import { Search, Plus, Upload } from "lucide-react";

interface SlipRow {
  id: string;
  slipNumber: string;
  slipDate: string | null;
  customerName: string | null;
  status: string;
  imageThumbPath: string | null;
  createdBy: { name: string };
  order: { orderCode: string } | null;
}

export function SlipTable() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["shipment-slips", q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/shipment-slips?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách phiếu");
      return res.json() as Promise<{ slips: SlipRow[] }>;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm số phiếu, khách hàng..."
            className="pl-8 pr-3 py-2 text-sm rounded-md border border-gray-200 w-64 focus:outline-none focus:ring-2 focus:ring-navy-900"
          />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/shipment-slips/import"
            className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
          >
            <Upload className="h-4 w-4" />
            Nhập Excel phiếu đi hàng
          </Link>
          <Link
            href="/shipment-slips/new"
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Cần cấu hình ANTHROPIC_API_KEY mới dùng được"
          >
            <Plus className="h-4 w-4" />
            Chụp ảnh / AI đọc phiếu
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {isLoading && <p className="text-sm text-gray-500 col-span-full">Đang tải...</p>}
        {!isLoading && (data?.slips.length ?? 0) === 0 && (
          <p className="text-sm text-gray-500 col-span-full">Chưa có phiếu đi hàng nào.</p>
        )}
        {data?.slips.map((s) => (
          <Link
            key={s.id}
            href={`/shipment-slips/${s.id}`}
            className="rounded-lg border border-gray-200 bg-white overflow-hidden hover:shadow-card transition-shadow"
          >
            <div className="aspect-[4/3] bg-gray-50">
              {s.imageThumbPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imageThumbPath} alt={s.slipNumber} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="p-3">
              <p className="font-medium text-navy-900 text-sm">{s.slipNumber}</p>
              <p className="text-xs text-gray-500 truncate">{s.customerName ?? "—"}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-gray-500">{formatDateVN(s.slipDate)}</span>
                {s.order && <span className="text-xs text-navy-900 font-medium">{s.order.orderCode}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
