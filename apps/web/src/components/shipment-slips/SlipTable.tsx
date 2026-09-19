"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateVN } from "@/lib/utils";
import { Search, Plus, Upload, RefreshCw, CheckCircle2, AlertTriangle, FileText, Camera, Sparkles, X } from "lucide-react";

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
    <div className="space-y-5">
      {/* Thanh Điều Khiển Toolbar Glassmorphism */}
      <div className="flex items-center justify-between gap-4 flex-wrap rounded-2xl border border-gray-200/80 bg-navy-900/60 p-4 shadow-card backdrop-blur-xl">
        <div className="relative min-w-[260px] sm:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm số phiếu, tên khách hàng..."
            className="w-full rounded-xl border border-gray-200/80 bg-navy-50/80 pl-9 pr-8 py-2 text-xs sm:text-sm text-ink placeholder:text-muted2/60 transition-all focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {isAdmin && (
            <button
              onClick={handleResync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200/90 bg-navy-50/70 px-4 py-2 text-xs font-semibold text-ink hover:border-gray-300 hover:bg-navy-50 disabled:opacity-50 transition-all shadow-sm"
              title="Chạy lại việc khớp toàn bộ phiếu với dữ liệu Tiến độ giao hàng hiện tại"
            >
              <RefreshCw className={syncing ? "h-3.5 w-3.5 animate-spin text-amber-500" : "h-3.5 w-3.5"} />
              <span>{syncing ? "Đang đồng bộ..." : "Đồng bộ lại giao hàng"}</span>
            </button>
          )}
          <Link
            href="/shipment-slips/import"
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 px-4 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(200,16,46,0.35)] hover:from-brandRed-700 hover:to-brandRed-800 transition-all"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Nhập Excel phiếu đi hàng</span>
          </Link>
          <Link
            href="/shipment-slips/new"
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-amber-foreground shadow-[0_0_15px_rgba(224,163,39,0.25)] hover:bg-amber-400 transition-all"
            title="Cần cấu hình ANTHROPIC_API_KEY mới dùng được"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Chụp ảnh / AI đọc phiếu</span>
          </Link>
        </div>
      </div>

      {syncError && (
        <div className="rounded-xl border border-brandRed-600/40 bg-brandRed-50/20 p-4 text-xs font-medium text-alert backdrop-blur-md flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {syncResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-success-600/30 bg-success-600/10 text-success-600 text-xs px-4 py-3 backdrop-blur-md">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Đã rà soát <strong>{syncResult.totalSlips}</strong> phiếu — khớp được{" "}
              <strong>{syncResult.totalMatched}</strong> dòng hàng vào Tiến độ giao hàng & Doanh số.
            </span>
          </div>
          {syncResult.totalUnmatchedItems > 0 && (
            <div className="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-xs backdrop-blur-md">
              <p className="flex items-center gap-2 font-semibold text-warning-500 mb-2">
                <AlertTriangle className="h-4 w-4" />
                {syncResult.totalUnmatchedItems} dòng hàng không khớp được — kiểm tra lại cột đã map khi nhập phiếu:
              </p>
              <ul className="space-y-1 text-ink2/90 font-mono text-[11px] max-h-40 overflow-y-auto pl-6 list-disc">
                {syncResult.unmatchedSamples.slice(0, 20).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Lưới Phiếu Đi Hàng Glassmorphism */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {isLoading && (
          <p className="text-xs text-muted-foreground col-span-full py-12 text-center">
            Đang tải danh sách phiếu đi hàng...
          </p>
        )}
        {!isLoading && (data?.slips.length ?? 0) === 0 && (
          <div className="col-span-full py-16 text-center text-muted-foreground rounded-2xl border border-gray-200/80 bg-navy-900/40 backdrop-blur-xl">
            <FileText className="h-10 w-10 text-muted2 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-ink">Chưa có phiếu đi hàng nào</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nhập từ file Excel hoặc chụp ảnh phiếu xuất kho để hệ thống tự động ghi nhận
            </p>
          </div>
        )}
        {data?.slips.map((s) => (
          <Link
            key={s.id}
            href={`/shipment-slips/${s.id}`}
            className="group overflow-hidden rounded-2xl border border-gray-200/80 bg-navy-900/60 shadow-card backdrop-blur-xl hover:border-amber-500/40 hover:shadow-[0_8px_30px_rgba(224,163,39,0.15)] transition-all duration-300 flex flex-col"
          >
            <div className="aspect-[4/3] bg-navy-100/70 overflow-hidden relative border-b border-gray-200/60">
              {s.imageThumbPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.imageThumbPath}
                  alt={s.slipNumber}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted2">
                  <FileText className="h-10 w-10 opacity-30" />
                </div>
              )}
              <div className="absolute top-2 left-2">
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-navy-900/90 border border-gray-300 text-amber-400 shadow-sm">
                  {s.slipNumber}
                </span>
              </div>
            </div>
            <div className="p-3.5 flex flex-col justify-between flex-1">
              <div>
                <p className="text-xs font-semibold text-ink truncate group-hover:text-amber-400 transition-colors">
                  {s.customerName ?? "—"}
                </p>
                {s.order && (
                  <p className="text-[11px] font-mono text-muted2 mt-0.5">
                    PO: {s.order.orderCode}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200/40 text-[11px] text-muted-foreground">
                <span>{formatDateVN(s.slipDate)}</span>
                <span className="text-[10px] text-muted2">bởi {s.createdBy?.name}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
