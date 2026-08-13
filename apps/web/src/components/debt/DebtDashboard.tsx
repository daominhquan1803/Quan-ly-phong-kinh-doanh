"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { ExternalLink, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DebtRow {
  id: string;
  customerName: string;
  totalDebt: string;
  overdueDebt: string;
}
interface SyncLog {
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
  recordsSynced: number | null;
}
interface DebtResponse {
  snapshotDate: string | null;
  rows: DebtRow[];
  totalDebt: number;
  overdueDebt: number;
  lastSync: SyncLog | null;
}

export function DebtDashboard({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["debt-snapshots"],
    queryFn: async () => {
      const res = await fetch("/api/debt/snapshots");
      if (!res.ok) throw new Error("Không tải được dữ liệu công nợ");
      return res.json() as Promise<DebtResponse>;
    },
  });

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/debt/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Đồng bộ thất bại");
      await queryClient.invalidateQueries({ queryKey: ["debt-snapshots"] });
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <a
          href="https://congno.hienvi.me/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm text-navy-900 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Xem chi tiết công nợ trên congno.hienvi.me
        </a>
        {isAdmin && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-md bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ thủ công"}
          </button>
        )}
      </div>

      {syncError && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{syncError}</div>}

      {data?.lastSync && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {data.lastSync.status === "SUCCESS" ? (
            <CheckCircle2 className="h-4 w-4 text-success-600" />
          ) : (
            <XCircle className="h-4 w-4 text-brandRed-600" />
          )}
          Lần đồng bộ gần nhất: {formatDateVN(data.lastSync.startedAt)}
          {data.lastSync.status === "FAILED" && data.lastSync.message && (
            <span className="text-brandRed-600">— {data.lastSync.message}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="kpi-card kpi-card--navy">
          <p className="text-sm text-gray-500">Tổng công nợ</p>
          <p className="text-2xl font-bold text-navy-900 mt-1">
            {isLoading ? "—" : formatCurrencyVND(data?.totalDebt ?? 0)}
          </p>
        </div>
        <div className="kpi-card kpi-card--red">
          <p className="text-sm text-gray-500">Công nợ quá hạn</p>
          <p className="text-2xl font-bold text-brandRed-600 mt-1">
            {isLoading ? "—" : formatCurrencyVND(data?.overdueDebt ?? 0)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Khách hàng</th>
              <th className="text-right font-medium px-4 py-2.5">Tổng công nợ</th>
              <th className="text-right font-medium px-4 py-2.5">Quá hạn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!isLoading && (data?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  Chưa có dữ liệu công nợ. Bấm &ldquo;Đồng bộ thủ công&rdquo; để lấy dữ liệu lần đầu.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">{r.customerName}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrencyVND(r.totalDebt)}</td>
                <td className={cn("px-4 py-2.5 text-right", Number(r.overdueDebt) > 0 && "text-brandRed-600 font-medium")}>
                  {formatCurrencyVND(r.overdueDebt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
