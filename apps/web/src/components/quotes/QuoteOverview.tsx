"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { cn, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import { FilterInput, SortableTh, toggleSort, type SortState } from "@/components/shared/SortableFilterableTable";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, X } from "lucide-react";
import { CHART_TOOLTIP_STYLE } from "@/components/dashboard/chart-theme";

type QuoteStatus = "WON" | "NEGOTIATING" | "LOST" | "NOT_QUOTED";

interface MonthMeta {
  year: number;
  month: number;
  label: string;
}
interface StatusStat {
  status: QuoteStatus;
  label: string;
  count: number;
  pct: number;
}
interface AssigneeStat {
  assigneeRaw: string;
  total: number;
  WON: number;
  NEGOTIATING: number;
  LOST: number;
  NOT_QUOTED: number;
}
interface SummaryResponse {
  year: number | null;
  month: number | null;
  total: number;
  byStatus: StatusStat[];
  byAssignee: AssigneeStat[];
  availableMonths: MonthMeta[];
  lastSyncedAt: string | null;
}
interface QuoteRow {
  id: string;
  requestDay: number | null;
  assigneeRaw: string | null;
  customerName: string;
  customerField: string | null;
  customerType: string | null;
  productInterest: string | null;
  quantity: string | null;
  unit: string | null;
  pricingStaff: string | null;
  note: string | null;
  status: QuoteStatus;
}
interface SyncLog {
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  message: string | null;
  recordsSynced: number | null;
}

const STATUS_LABEL: Record<QuoteStatus, string> = {
  WON: "Chốt được giá",
  NEGOTIATING: "Đang thương thảo",
  LOST: "Không bán được",
  NOT_QUOTED: "Chưa báo giá",
};
const STATUS_STYLE: Record<QuoteStatus, string> = {
  WON: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]",
  NEGOTIATING: "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_8px_rgba(224,163,39,0.2)]",
  LOST: "bg-brandRed-500/15 text-brandRed-400 border border-brandRed-500/30 shadow-[0_0_8px_rgba(200,16,46,0.2)]",
  NOT_QUOTED: "bg-white/5 text-gray-400 border border-white/10",
};
const STATUS_CHART_COLOR: Record<QuoteStatus, string> = {
  WON: "#10B981",
  NEGOTIATING: "#F59E0B",
  LOST: "#EF4444",
  NOT_QUOTED: "#64748B",
};
const STATUS_KPI_BORDER: Record<QuoteStatus, string> = {
  WON: "border-t-success-600",
  NEGOTIATING: "border-t-warning-500",
  LOST: "border-t-brandRed-600",
  NOT_QUOTED: "border-t-gray-400",
};

type SortField = "requestDay" | "customerName" | "assigneeRaw";

export function QuoteOverview({ isAdmin }: { isAdmin: boolean }) {
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState<SortField>>({ field: "requestDay", dir: "desc" });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["quotes-summary", year, month],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (year && month) {
        params.set("year", String(year));
        params.set("month", String(month));
      }
      const res = await fetch(`/api/quotes/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được thống kê báo giá");
      return res.json() as Promise<SummaryResponse>;
    },
  });

  // Lần đầu tải xong, tự chọn tháng gần nhất đang có dữ liệu (server đã tự chọn sẵn trong
  // response khi không truyền year/month) — để lần fetch tiếp theo (list chi tiết bên dưới) và
  // bộ chọn tháng hiển thị đúng, đồng bộ với dữ liệu đang xem.
  useEffect(() => {
    if (!year && summary?.year && summary?.month) {
      setYear(summary.year);
      setMonth(summary.month);
    }
  }, [summary, year]);

  const { data: syncData } = useQuery({
    queryKey: ["quotes-sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/quotes/sync");
      if (!res.ok) throw new Error("Không tải được trạng thái đồng bộ");
      return res.json() as Promise<{ lastSync: SyncLog | null }>;
    },
    refetchInterval: 30_000,
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["quotes-list", year, month, statusFilter, assigneeFilter],
    enabled: !!year && !!month,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (year) params.set("year", String(year));
      if (month) params.set("month", String(month));
      if (statusFilter) params.set("status", statusFilter);
      if (assigneeFilter) params.set("assignee", assigneeFilter);
      const res = await fetch(`/api/quotes?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách báo giá");
      return res.json() as Promise<{ rows: QuoteRow[] }>;
    },
  });

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/quotes/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Đồng bộ thất bại");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quotes-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["quotes-list"] }),
        queryClient.invalidateQueries({ queryKey: ["quotes-sync-status"] }),
      ]);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSyncing(false);
    }
  }

  const hasActiveFilter = !!q.trim();
  const visibleRows = useMemo(() => {
    let list = listData?.rows ?? [];
    if (q.trim()) {
      const nq = normalizeVN(q);
      list = list.filter(
        (r) =>
          normalizeVN(r.customerName).includes(nq) ||
          normalizeVN(r.productInterest ?? "").includes(nq) ||
          normalizeVN(r.assigneeRaw ?? "").includes(nq)
      );
    }
    if (sort.field) {
      const field = sort.field;
      const dir = sort.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const av = field === "requestDay" ? a.requestDay ?? -1 : String(a[field] ?? "");
        const bv = field === "requestDay" ? b.requestDay ?? -1 : String(b[field] ?? "");
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    return list;
  }, [listData, q, sort]);

  function handleSort(field: SortField) {
    setSort((prev) => toggleSort(prev, field));
  }

  const donutData = (summary?.byStatus ?? []).filter((s) => s.count > 0).map((s) => ({ name: s.label, value: s.count, status: s.status }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <select
            value={month ?? ""}
            onChange={(e) => {
              const m = Number(e.target.value);
              const found = summary?.availableMonths.find((am) => am.month === m);
              if (found) {
                setMonth(found.month);
                setYear(found.year);
                setAssigneeFilter("");
              }
            }}
            className="text-xs font-medium bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
          >
            {(summary?.availableMonths ?? []).map((m) => (
              <option key={`${m.year}-${m.month}`} value={m.month}>
                {m.label}
              </option>
            ))}
            {(summary?.availableMonths.length ?? 0) === 0 && <option value="">Chưa có dữ liệu</option>}
          </select>
        </div>
        {isAdmin && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 px-4 py-2 text-xs font-semibold text-black shadow-[0_0_15px_rgba(224,163,39,0.3)] disabled:opacity-60 transition-all"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ Google Sheet"}
          </button>
        )}
      </div>

      {syncError && (
        <div className="rounded-xl border border-brandRed-500/30 bg-brandRed-500/10 text-brandRed-400 text-sm px-4 py-3 shadow-[0_0_15px_rgba(200,16,46,0.15)]">
          {syncError}
        </div>
      )}

      {syncData?.lastSync && (
        <div className="flex items-center gap-2 text-xs text-muted2">
          {syncData.lastSync.status === "SUCCESS" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : syncData.lastSync.status === "FAILED" ? (
            <XCircle className="h-4 w-4 text-brandRed-400" />
          ) : (
            <RefreshCw className="h-4 w-4 animate-spin text-amber-400" />
          )}
          <span>Đồng bộ gần nhất: <strong className="text-ink font-mono">{formatDateVN(syncData.lastSync.startedAt)}</strong></span>
          {syncData.lastSync.recordsSynced != null && <span className="font-mono">({syncData.lastSync.recordsSynced} dòng)</span>}
          {syncData.lastSync.status === "FAILED" && syncData.lastSync.message && (
            <span className="text-brandRed-400">— {syncData.lastSync.message}</span>
          )}
        </div>
      )}

      <div className="glass-card border border-amber-500/25 bg-amber-500/[0.02] p-4 rounded-xl flex items-start gap-2.5 text-xs text-amber-300/90 shadow-[0_0_15px_rgba(224,163,39,0.06)]">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
        <span className="leading-relaxed">
          Trạng thái (Chốt được giá / Đang thương thảo / Không bán được / Chưa báo giá) được nhận diện tự động từ màu nền dòng trong Google Sheet gốc.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="glass-card border border-white/10 p-4 relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <p className="text-xs font-medium text-muted2 tracking-wider uppercase">Tổng số báo giá</p>
          <p className="text-2xl font-bold font-mono text-ink mt-2">{summaryLoading ? "—" : summary?.total ?? 0}</p>
          <p className="text-xs text-muted2 mt-1">{summary?.month ? `Tháng ${summary.month}/${summary.year}` : ""}</p>
          <div className="h-0.5 w-12 bg-white/20 mt-3 group-hover:w-full group-hover:bg-amber-400/50 transition-all duration-300" />
        </div>

        {(summary?.byStatus ?? []).map((s) => {
          const isWon = s.status === "WON";
          const isNegotiating = s.status === "NEGOTIATING";
          const isLost = s.status === "LOST";
          return (
            <div
              key={s.status}
              className={cn(
                "glass-card p-4 relative overflow-hidden group transition-all",
                isWon
                  ? "border border-emerald-500/30 bg-emerald-500/[0.03] hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                  : isNegotiating
                  ? "border border-amber-500/30 bg-amber-500/[0.03] hover:shadow-[0_0_20px_rgba(224,163,39,0.15)]"
                  : isLost
                  ? "border border-brandRed-500/30 bg-brandRed-500/[0.03] hover:shadow-[0_0_20px_rgba(200,16,46,0.15)]"
                  : "border border-white/10 bg-white/[0.02]"
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted2 tracking-wider uppercase">{s.label}</p>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_CHART_COLOR[s.status] }} />
              </div>
              <p className="text-2xl font-bold font-mono text-ink mt-2">
                <span style={{ color: STATUS_CHART_COLOR[s.status] }}>{s.pct}%</span>
              </p>
              <p className="text-xs font-mono text-muted2 mt-1">{s.count} báo giá</p>
              <div
                className="h-0.5 w-12 mt-3 group-hover:w-full transition-all duration-300"
                style={{ backgroundColor: STATUS_CHART_COLOR[s.status] }}
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {donutData.length > 0 && (
          <div className="glass-card border border-white/10 p-5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
            <h2 className="font-semibold text-ink text-sm tracking-wide mb-1">Tỷ lệ theo trạng thái</h2>
            <p className="text-xs text-muted2 mb-3">{summary?.month ? `Tháng ${summary.month}/${summary.year}` : ""}</p>
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={68}
                    outerRadius={96}
                    paddingAngle={3}
                    cornerRadius={4}
                    stroke="#0B132B"
                    strokeWidth={2}
                  >
                    {donutData.map((d) => (
                      <Cell key={d.status} fill={STATUS_CHART_COLOR[d.status]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value} báo giá (${summary?.total ? Math.round((value / summary.total) * 100) : 0}%)`,
                      name,
                    ]}
                    contentStyle={CHART_TOOLTIP_STYLE}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold font-mono text-ink">{summary?.total ?? 0}</span>
                <span className="text-[11px] text-muted2 uppercase tracking-wider">báo giá</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3 pt-3 border-t border-white/5">
              {(summary?.byStatus ?? []).map((s) => (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_CHART_COLOR[s.status] }} />
                  <span className="text-muted2 truncate">{s.label}</span>
                  <span className="ml-auto font-mono font-medium text-ink whitespace-nowrap">
                    {s.count} <span className="text-muted2 font-normal">({s.pct}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="lg:col-span-2 glass-card border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
            <h2 className="font-semibold text-ink text-sm tracking-wide">Theo nhân viên phụ trách</h2>
            <span className="text-xs text-muted2 font-mono">Bấm hàng để lọc</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5 backdrop-blur-md">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Phụ trách</th>
                  <th className="text-right font-medium px-4 py-3">Tổng</th>
                  <th className="text-right font-medium px-4 py-3 text-emerald-400">Chốt</th>
                  <th className="text-right font-medium px-4 py-3 text-amber-400">Thương thảo</th>
                  <th className="text-right font-medium px-4 py-3 text-brandRed-400">Không bán</th>
                  <th className="text-right font-medium px-4 py-3">Chưa báo giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(summary?.byAssignee.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      {summaryLoading ? "Đang tải..." : "Chưa có dữ liệu."}
                    </td>
                  </tr>
                )}
                {summary?.byAssignee.map((a) => (
                  <tr
                    key={a.assigneeRaw}
                    className={cn(
                      "hover:bg-white/[0.03] cursor-pointer transition-colors",
                      assigneeFilter === a.assigneeRaw && "bg-amber-500/10 ring-1 ring-inset ring-amber-500/30"
                    )}
                    onClick={() => setAssigneeFilter((prev) => (prev === a.assigneeRaw ? "" : a.assigneeRaw))}
                    title="Bấm để lọc bảng chi tiết theo người này"
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">{a.assigneeRaw}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-ink">{a.total}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">{a.WON || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-400">{a.NEGOTIATING || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-brandRed-400">{a.LOST || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted2">{a.NOT_QUOTED || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="glass-card border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-3.5 border-b border-white/5 backdrop-blur-md">
          <h2 className="font-semibold text-ink text-sm tracking-wide">Chi tiết từng báo giá</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as QuoteStatus | "")}
              className="text-xs font-medium bg-card text-ink rounded-xl border border-white/10 py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
            >
              <option value="">Tất cả trạng thái</option>
              {(summary?.byStatus ?? []).map((s) => (
                <option key={s.status} value={s.status}>
                  {s.label}
                </option>
              ))}
            </select>
            {assigneeFilter && (
              <button
                onClick={() => setAssigneeFilter("")}
                className="inline-flex items-center gap-1 text-xs text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-xl px-2.5 py-1.5"
              >
                <X className="h-3 w-3" /> {assigneeFilter}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5">
              <tr>
                <SortableTh field="requestDay" sort={sort} onSort={handleSort}>
                  Ngày
                </SortableTh>
                <SortableTh field="assigneeRaw" sort={sort} onSort={handleSort}>
                  Phụ trách
                </SortableTh>
                <SortableTh field="customerName" sort={sort} onSort={handleSort}>
                  Khách hàng
                </SortableTh>
                <th className="text-left font-medium px-4 py-3">Mặt hàng quan tâm</th>
                <th className="text-left font-medium px-4 py-3">SL / ĐVT</th>
                <th className="text-left font-medium px-4 py-3">Nhân viên báo giá</th>
                <th className="text-left font-medium px-4 py-3">Trạng thái</th>
              </tr>
              <tr className="bg-black/30 border-t border-white/5">
                <th colSpan={3} className="px-4 py-2 font-normal">
                  <FilterInput value={q} onChange={setQ} placeholder="Tìm khách hàng, mặt hàng, phụ trách..." />
                </th>
                <th colSpan={4} className="px-4 py-2 text-right">
                  {hasActiveFilter && (
                    <button onClick={() => setQ("")} className="inline-flex items-center gap-1 text-xs text-brandRed-400 hover:underline">
                      <X className="h-3 w-3" /> Xoá lọc
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {listLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                      Đang tải danh sách báo giá...
                    </div>
                  </td>
                </tr>
              )}
              {!listLoading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted2">
                    {hasActiveFilter ? "Không tìm thấy báo giá phù hợp." : "Chưa có báo giá nào trong tháng này."}
                  </td>
                </tr>
              )}
              {visibleRows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-muted2 whitespace-nowrap">{r.requestDay ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{r.assigneeRaw ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{r.customerName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate" title={r.productInterest ?? undefined}>
                    {r.productInterest ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono text-muted2">
                    {r.quantity ?? "—"} {r.unit ?? ""}
                  </td>
                  <td className="px-4 py-2.5 text-muted2">{r.pricingStaff ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", STATUS_STYLE[r.status])}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasActiveFilter && !listLoading && (
          <p className="text-xs text-muted2 px-5 py-2.5 border-t border-white/5 font-mono">
            Đang hiển thị {visibleRows.length} / {listData?.rows.length ?? 0} báo giá theo bộ lọc.
          </p>
        )}
      </div>
    </div>
  );
}
