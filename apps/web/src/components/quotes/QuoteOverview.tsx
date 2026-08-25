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
  WON: "bg-success-600/10 text-success-600",
  NEGOTIATING: "bg-warning-500/10 text-warning-500",
  LOST: "bg-brandRed-50 text-brandRed-600",
  NOT_QUOTED: "bg-gray-200 text-muted-foreground",
};
const STATUS_CHART_COLOR: Record<QuoteStatus, string> = {
  WON: "#22B378",
  NEGOTIATING: "#F2A93B",
  LOST: "#C8102E",
  NOT_QUOTED: "#5b6478",
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
                // Bộ lọc theo nhân viên (bấm từ bảng "Theo nhân viên phụ trách") đặt riêng cho
                // từng tháng — người đó có thể không có báo giá nào ở tháng khác, xoá đi để
                // tránh bảng chi tiết hiện trống gây hiểu nhầm là lỗi.
                setAssigneeFilter("");
              }
            }}
            className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
            className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ thủ công"}
          </button>
        )}
      </div>

      {syncError && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{syncError}</div>}

      {syncData?.lastSync && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {syncData.lastSync.status === "SUCCESS" ? (
            <CheckCircle2 className="h-4 w-4 text-success-600" />
          ) : syncData.lastSync.status === "FAILED" ? (
            <XCircle className="h-4 w-4 text-brandRed-600" />
          ) : (
            <RefreshCw className="h-4 w-4 animate-spin" />
          )}
          Đồng bộ gần nhất: {formatDateVN(syncData.lastSync.startedAt)}
          {syncData.lastSync.recordsSynced != null && ` — ${syncData.lastSync.recordsSynced} dòng`}
          {syncData.lastSync.status === "FAILED" && syncData.lastSync.message && (
            <span className="text-brandRed-600">— {syncData.lastSync.message}</span>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md bg-warning-500/10 text-warning-500 text-xs px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Trạng thái (Chốt được giá / Đang thương thảo / Không bán được / Chưa báo giá) được suy đoán tự động từ MÀU
          NỀN dòng trong Google Sheet gốc (file không có cột chữ ghi trạng thái) — có thể sai lệch một phần với các
          dòng dùng màu hiếm gặp, không thuộc 3 màu quy ước (xanh lá/vàng/đỏ).
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="kpi-card kpi-card--navy">
          <p className="text-sm text-muted-foreground">Tổng số báo giá</p>
          <p className="text-2xl font-bold text-ink mt-1">{summaryLoading ? "—" : summary?.total ?? 0}</p>
          <p className="text-xs text-muted2 mt-1">{summary?.month ? `Tháng ${summary.month}/${summary.year}` : ""}</p>
        </div>
        {(summary?.byStatus ?? []).map((s) => (
          <div key={s.status} className={cn("kpi-card", STATUS_KPI_BORDER[s.status])}>
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-ink mt-1">{s.pct}%</p>
            <p className="text-xs text-muted2 mt-1">{s.count} báo giá</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {donutData.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-card p-5">
            <h2 className="font-medium text-ink mb-1">Tỷ lệ theo trạng thái</h2>
            <p className="text-xs text-muted2 mb-2">{summary?.month ? `Tháng ${summary.month}/${summary.year}` : ""}</p>
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
                    stroke="#101c31"
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
                <span className="text-2xl font-bold text-ink">{summary?.total ?? 0}</span>
                <span className="text-[11px] text-muted2">báo giá</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3 pt-3 border-t border-gray-100">
              {(summary?.byStatus ?? []).map((s) => (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_CHART_COLOR[s.status] }} />
                  <span className="text-muted-foreground truncate">{s.label}</span>
                  <span className="ml-auto font-medium text-ink whitespace-nowrap">
                    {s.count} <span className="text-muted2 font-normal">({s.pct}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="lg:col-span-2 rounded-lg border border-gray-200 bg-card overflow-x-auto">
          <div className="px-4 pt-3 pb-1">
            <h2 className="font-medium text-ink">Theo nhân viên phụ trách</h2>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Phụ trách</th>
                <th className="text-right font-medium px-4 py-2.5">Tổng</th>
                <th className="text-right font-medium px-4 py-2.5 text-success-600">Chốt</th>
                <th className="text-right font-medium px-4 py-2.5 text-warning-500">Thương thảo</th>
                <th className="text-right font-medium px-4 py-2.5 text-brandRed-600">Không bán được</th>
                <th className="text-right font-medium px-4 py-2.5">Chưa báo giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
                  className={cn("hover:bg-gray-50 cursor-pointer", assigneeFilter === a.assigneeRaw && "bg-navy-50/60")}
                  onClick={() => setAssigneeFilter((prev) => (prev === a.assigneeRaw ? "" : a.assigneeRaw))}
                  title="Bấm để lọc bảng chi tiết theo người này"
                >
                  <td className="px-4 py-2.5 font-medium text-ink">{a.assigneeRaw}</td>
                  <td className="px-4 py-2.5 text-right">{a.total}</td>
                  <td className="px-4 py-2.5 text-right text-success-600">{a.WON || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-warning-500">{a.NEGOTIATING || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-brandRed-600">{a.LOST || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{a.NOT_QUOTED || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 pt-3 pb-1">
          <h2 className="font-medium text-ink">Chi tiết từng báo giá</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as QuoteStatus | "")}
              className="text-sm bg-card text-ink rounded-md border border-gray-200 py-1.5 px-2"
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
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brandRed-600 border border-gray-200 rounded-md px-2 py-1.5"
              >
                <X className="h-3 w-3" /> {assigneeFilter}
              </button>
            )}
          </div>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-muted-foreground">
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
              <th className="text-left font-medium px-4 py-2.5">Mặt hàng quan tâm</th>
              <th className="text-left font-medium px-4 py-2.5">SL / ĐVT</th>
              <th className="text-left font-medium px-4 py-2.5">Nhân viên báo giá</th>
              <th className="text-left font-medium px-4 py-2.5">Trạng thái</th>
            </tr>
            <tr className="bg-card border-t border-gray-100">
              <th colSpan={3} className="px-4 py-2 font-normal">
                <FilterInput value={q} onChange={setQ} placeholder="Tìm khách hàng, mặt hàng, phụ trách..." />
              </th>
              <th colSpan={4} className="px-4 py-2 text-right">
                {hasActiveFilter && (
                  <button onClick={() => setQ("")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brandRed-600">
                    <X className="h-3 w-3" /> Xoá lọc
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Đang tải...
                </td>
              </tr>
            )}
            {!listLoading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  {hasActiveFilter ? "Không tìm thấy báo giá phù hợp" : "Chưa có báo giá nào trong tháng này."}
                </td>
              </tr>
            )}
            {visibleRows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 whitespace-nowrap">{r.requestDay ?? "—"}</td>
                <td className="px-4 py-2.5">{r.assigneeRaw ?? "—"}</td>
                <td className="px-4 py-2.5 font-medium text-ink">{r.customerName}</td>
                <td className="px-4 py-2.5 max-w-xs truncate" title={r.productInterest ?? undefined}>
                  {r.productInterest ?? "—"}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {r.quantity ?? "—"} {r.unit ?? ""}
                </td>
                <td className="px-4 py-2.5">{r.pricingStaff ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("status-badge", STATUS_STYLE[r.status])}>{STATUS_LABEL[r.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasActiveFilter && !listLoading && (
          <p className="text-xs text-muted-foreground px-4 py-2">
            Đang hiển thị {visibleRows.length} / {listData?.rows.length ?? 0} báo giá theo bộ lọc hiện tại.
          </p>
        )}
      </div>
    </div>
  );
}
