"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Search, X } from "lucide-react";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";

type By = "customer" | "item";
type Metric = "order" | "delivered";

interface Row {
  key: string;
  code: string;
  name: string;
  ownerName: string;
  orders: number[];
  delivered: number[];
  ordersTotal: number;
  deliveredTotal: number;
}
interface LookupResponse {
  months: string[];
  rows: Row[];
  minMonth: string;
  maxMonth: string;
}
interface DetailRow {
  date: string;
  poCode: string;
  customerCode: string;
  customerName: string;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: number;
  value: number;
  source: string;
}

const selectCls = "text-sm bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500";
const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const METRICS: { key: Metric; label: string; hint: string }[] = [
  { key: "order", label: "Doanh số đơn hàng", hint: "Giá trị PO theo ngày PO." },
  { key: "delivered", label: "Doanh số đi hàng", hint: "Giá trị các đợt giao theo ngày giao (file theo dõi PO của phòng nhiều năm và Phiếu đi hàng)." },
];

export function SalesLookupPanel({ isAdmin, initialBy = "customer", initialQuery = "" }: { isAdmin: boolean; initialBy?: By; initialQuery?: string }) {
  const [by, setBy] = useState<By>(initialBy);
  const [metric, setMetric] = useState<Metric>("order");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [search, setSearch] = useState(initialQuery);
  const [selected, setSelected] = useState<{ key: string; name: string; month: string } | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams({ by });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (employeeId) p.set("employeeId", employeeId);
    return p;
  }, [by, from, to, employeeId]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["sales-lookup", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/reports/sales-lookup?${params.toString()}`);
      if (!res.ok) throw new Error("sales-lookup");
      return (await res.json()) as LookupResponse;
    },
  });

  const { data: detail, isFetching: detailLoading } = useQuery({
    queryKey: ["sales-lookup-detail", by, metric, selected?.key, selected?.month, employeeId],
    enabled: !!selected,
    queryFn: async () => {
      const p = new URLSearchParams({ by, detail: "1", key: selected!.key, month: selected!.month, metric });
      if (employeeId) p.set("employeeId", employeeId);
      const res = await fetch(`/api/reports/sales-lookup?${p.toString()}`);
      if (!res.ok) throw new Error("detail");
      return ((await res.json()) as { rows: DetailRow[] }).rows;
    },
  });

  const months = data?.months ?? [];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.rows ?? [];
    const filtered = q ? list.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) : list;
    const pick = (r: Row) => (metric === "order" ? r.ordersTotal : r.deliveredTotal);
    return [...filtered].sort((a, b) => pick(b) - pick(a));
  }, [data, search, metric]);

  const monthTotals = useMemo(
    () => months.map((_, i) => rows.reduce((s, r) => s + (metric === "order" ? r.orders[i] : r.delivered[i]), 0)),
    [months, rows, metric]
  );
  const grand = monthTotals.reduce((s, v) => s + v, 0);
  const current = METRICS.find((m) => m.key === metric)!;
  const downloadHref = `/api/reports/sales-lookup?${params.toString()}&format=xlsx`;
  const monthLabel = (m: string) => `T${m.slice(5)}/${m.slice(2, 4)}`;

  return (
    <div className="glass-card border border-white/10 p-5 space-y-5">
      <div className="flex flex-wrap gap-2">
        {([
          ["customer", "Theo khách hàng"],
          ["item", "Theo mã hàng"],
        ] as [By, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              setBy(k);
              setSelected(null);
            }}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm font-semibold transition-all",
              by === k ? "border-amber-500/60 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[0.03] text-ink hover:bg-white/[0.08]"
            )}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 hidden sm:block w-px bg-white/10" />
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm font-semibold transition-all",
              metric === m.key ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/[0.03] text-ink hover:bg-white/[0.08]"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted2">
        {current.hint} Số liệu từ đầu năm 2026. Bấm vào một số để xem các dòng tạo nên số đó.
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted2">
          Từ tháng
          <input type="month" value={from || data?.minMonth || ""} min={data?.minMonth} max={data?.maxMonth} onChange={(e) => setFrom(e.target.value)} className={cn(selectCls, "font-mono")} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted2">
          Đến tháng
          <input type="month" value={to || data?.maxMonth || ""} min={data?.minMonth} max={data?.maxMonth} onChange={(e) => setTo(e.target.value)} className={cn(selectCls, "font-mono")} />
        </label>
        {isAdmin && (
          <div className="flex flex-col gap-1 text-xs text-muted2">
            Nhân viên kinh doanh
            <EmployeeFilterSelect value={employeeId} onChange={(id) => { setEmployeeId(id); setSelected(null); }} />
          </div>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted2">
          Tìm {by === "customer" ? "khách hàng" : "mã hàng"}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Gõ mã hoặc tên..." className={cn(selectCls, "w-56 pl-8")} />
          </div>
        </label>
        <a
          href={downloadHref}
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          title="Tải Excel gồm cả 2 sheet: doanh số đơn hàng và doanh số đi hàng"
        >
          <Download className="h-4 w-4" /> Tải Excel
        </a>
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted2" />}
      </div>

      {isError && <p className="text-sm text-alert">Không tải được số liệu. Thử lại sau.</p>}

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="min-w-full text-xs">
          <thead className="bg-white/[0.04] text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-navy-900 text-left font-medium px-3 py-2.5 min-w-[220px]">{by === "customer" ? "Khách hàng" : "Mã hàng"}</th>
              {by === "customer" && <th className="text-left font-medium px-3 py-2.5">NVKD</th>}
              {months.map((m) => (
                <th key={m} className="text-right font-medium px-3 py-2.5 whitespace-nowrap">{monthLabel(m)}</th>
              ))}
              <th className="text-right font-medium px-3 py-2.5">Tổng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={months.length + 3} className="px-3 py-6 text-center text-muted-foreground">Không có số liệu trong khoảng này.</td>
              </tr>
            )}
            {rows.slice(0, 300).map((r) => {
              const values = metric === "order" ? r.orders : r.delivered;
              const total = metric === "order" ? r.ordersTotal : r.deliveredTotal;
              return (
                <tr key={r.key} className="hover:bg-white/[0.02]">
                  <td className="sticky left-0 bg-navy-900 px-3 py-2 text-ink" title={r.ownerName ? `${r.name} — ${r.ownerName}` : r.name}>
                    <div className="font-medium">{r.code || r.name}</div>
                    {r.code && <div className="text-[11px] text-muted2 max-w-[260px] truncate">{r.name}</div>}
                  </td>
                  {by === "customer" && <td className="px-3 py-2 text-muted2 whitespace-nowrap">{r.ownerName || "—"}</td>}
                  {values.map((v, i) => (
                    <td key={months[i]} className="px-3 py-2 text-right font-mono">
                      {v ? (
                        <button
                          onClick={() => setSelected({ key: r.key, name: r.name || r.code, month: months[i] })}
                          className={cn("underline-offset-2 hover:underline", selected?.key === r.key && selected.month === months[i] ? "text-amber-300" : "text-ink")}
                        >
                          {num.format(v)}
                        </button>
                      ) : (
                        <span className="text-muted2">–</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-300">{num.format(total)}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-white/[0.04] font-semibold">
              <tr>
                <td className="sticky left-0 bg-navy-900 px-3 py-2.5 text-ink">Tổng ({rows.length} {by === "customer" ? "khách" : "mã hàng"})</td>
                {by === "customer" && <td />}
                {monthTotals.map((v, i) => (
                  <td key={months[i]} className="px-3 py-2.5 text-right font-mono text-ink">{num.format(v)}</td>
                ))}
                <td className="px-3 py-2.5 text-right font-mono text-emerald-300">{num.format(grand)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 300 && <p className="text-xs text-muted2">Chỉ hiện 300 dòng đầu theo doanh số. Dùng ô tìm hoặc tải Excel để xem đủ.</p>}

      {selected && (
        <div className="rounded-xl border border-amber-500/30 bg-black/30 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-ink">
              {current.label} — {selected.name} — tháng {selected.month.slice(5)}/{selected.month.slice(0, 4)}
            </p>
            <button onClick={() => setSelected(null)} className="text-muted2 hover:text-ink" aria-label="Đóng chi tiết">
              <X className="h-4 w-4" />
            </button>
          </div>
          {detailLoading && <Loader2 className="h-4 w-4 animate-spin text-muted2" />}
          {detail && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-2.5 py-1.5">Ngày</th>
                    <th className="text-left font-medium px-2.5 py-1.5">Số PO</th>
                    {by === "item" && <th className="text-left font-medium px-2.5 py-1.5">Khách hàng</th>}
                    <th className="text-left font-medium px-2.5 py-1.5">Mã hàng</th>
                    <th className="text-left font-medium px-2.5 py-1.5">Tên sản phẩm</th>
                    <th className="text-right font-medium px-2.5 py-1.5">Số lượng</th>
                    <th className="text-right font-medium px-2.5 py-1.5">Giá trị</th>
                    {metric === "delivered" && <th className="text-left font-medium px-2.5 py-1.5">Nguồn</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {detail.map((d, i) => (
                    <tr key={i}>
                      <td className="px-2.5 py-1.5 whitespace-nowrap">{formatDateVN(d.date)}</td>
                      <td className="px-2.5 py-1.5 font-mono text-amber-300/90">{d.poCode}</td>
                      {by === "item" && <td className="px-2.5 py-1.5">{d.customerCode}</td>}
                      <td className="px-2.5 py-1.5">{d.itemCode || "—"}</td>
                      <td className="px-2.5 py-1.5 max-w-[320px] truncate" title={d.itemName}>{d.itemName}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono">{num.format(d.qty)} {d.unit}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-ink">{formatCurrencyVND(d.value)}</td>
                      {metric === "delivered" && <td className="px-2.5 py-1.5 text-muted2">{d.source}</td>}
                    </tr>
                  ))}
                  {detail.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-2.5 py-3 text-center text-muted-foreground">Không có dòng nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
