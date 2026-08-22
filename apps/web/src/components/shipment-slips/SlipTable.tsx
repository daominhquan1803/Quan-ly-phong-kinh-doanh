"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateVN } from "@/lib/utils";
import { Search, Plus, Upload, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

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

interface ResyncResult {
  totalSlips: number;
  totalMatched: number;
  totalUnmatchedItems: number;
  unmatchedSamples: string[];
}

export function SlipTable({ isAdmin }: { isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<ResyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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

  async function handleResync() {
    if (
      !window.confirm(
        "Đồng bộ lại toàn bộ Phiếu đi hàng với dữ liệu Tiến độ giao hàng hiện tại? Dùng khi số liệu giao hàng chưa cập nhật đúng sau khi upload phiếu."
      )
    ) {
      return;
    }
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/shipment-slips/resync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không đồng bộ lại được");
      setSyncResult(json);
      // Mọi trang đọc doanh số/tiến độ giao hàng đều lấy CHUNG 1 nguồn (PoDeliveryEvent/
      // PoTrackingLine) nên chỉ cần refetch đúng các query đang cache ở client — không có
      // "đồng bộ riêng" cho từng trang, dữ liệu DB đã đúng ngay sau khi resync xong.
      queryClient.invalidateQueries({ queryKey: ["shipment-slips"] });
      queryClient.invalidateQueries({ queryKey: ["shipping-status-summary"] });
      queryClient.invalidateQueries({ queryKey: ["targets"] });
      queryClient.invalidateQueries({ queryKey: ["sales-plan-lines"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-report"] });
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSyncing(false);
    }
  }

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
          {isAdmin && (
            <button
              onClick={handleResync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Chạy lại việc khớp toàn bộ phiếu với dữ liệu Tiến độ giao hàng hiện tại"
            >
              <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {syncing ? "Đang đồng bộ..." : "Đồng bộ lại giao hàng"}
            </button>
          )}
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

      {syncError && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{syncError}</div>}

      {syncResult && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md bg-success-600/10 text-success-600 text-sm px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4" />
            Đã rà soát {syncResult.totalSlips} phiếu — khớp được {syncResult.totalMatched} dòng hàng vào Tiến độ giao
            hàng/Doanh số.
          </div>
          {syncResult.totalUnmatchedItems > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-warning-500 mb-2">
                <AlertTriangle className="h-4 w-4" />
                {syncResult.totalUnmatchedItems} dòng hàng không khớp được (thiếu Số PO/SL thực xuất, hoặc không tìm
                thấy đúng dòng PO tương ứng) — kiểm tra lại cột đã map khi nhập phiếu:
              </p>
              <ul className="space-y-1 text-gray-700">
                {syncResult.unmatchedSamples.slice(0, 20).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
