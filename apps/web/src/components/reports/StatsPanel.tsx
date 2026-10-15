"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";

type Kind = "dormant-customers" | "dormant-items" | "invoices";
type Bucket = "2" | "3" | "over3";

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "dormant-customers", label: "Khách hàng lâu chưa mua", hint: "Khách có PO cuối cùng cách đây đúng mốc đã chọn, kèm lịch sử mua 6 tháng gần PO cuối (mã hàng, số lượng, doanh số)." },
  { key: "dormant-items", label: "Mã hàng lâu chưa mua (theo khách)", hint: "Từng mã hàng mà khách đó lâu chưa đặt lại, kèm lịch sử mua 6 tháng gần lần mua cuối của mã hàng." },
  { key: "invoices", label: "Hoá đơn theo khách hàng", hint: "Số hoá đơn, ngày hoá đơn, hạn thanh toán, tổng số tiền và trạng thái thanh toán." },
];
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "2", label: "2 tháng (chưa mua từ 2 đến dưới 3 tháng)" },
  { key: "3", label: "3 tháng (từ 3 đến dưới 4 tháng)" },
  { key: "over3", label: "Trên 3 tháng (từ 4 tháng trở lên)" },
];

interface PreviewResponse {
  kind: Kind;
  count: number;
  bucketLabel?: string;
  customers?: number;
  totals?: { total: number; paid: number; remaining: number };
  counts?: { paid: number; partial: number; unpaid: number };
  sample: Record<string, string | number | null>[];
}
interface OptionsResponse {
  customers: { key: string; code: string; name: string; invoiceCount: number }[];
  months: string[];
}

const selectCls = "text-sm bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500";

export function StatsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [kind, setKind] = useState<Kind>("dormant-customers");
  const [bucket, setBucket] = useState<Bucket>("2");
  const [customer, setCustomer] = useState("ALL");
  const [customerQuery, setCustomerQuery] = useState("");
  const [month, setMonth] = useState("ALL");
  const [employeeId, setEmployeeId] = useState("");

  const params = useMemo(() => {
    const p = new URLSearchParams({ kind });
    if (kind === "invoices") {
      p.set("customer", customer);
      p.set("month", month);
    } else {
      p.set("bucket", bucket);
    }
    if (employeeId) p.set("employeeId", employeeId);
    return p;
  }, [kind, bucket, customer, month, employeeId]);

  const { data: options } = useQuery({
    queryKey: ["stats-options", employeeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/stats/options${employeeId ? `?employeeId=${employeeId}` : ""}`);
      if (!res.ok) throw new Error("options");
      return (await res.json()) as OptionsResponse;
    },
    enabled: kind === "invoices",
  });

  const { data, isFetching, isError } = useQuery({
    queryKey: ["stats-preview", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/reports/stats?${params.toString()}&format=json`);
      if (!res.ok) throw new Error("preview");
      return (await res.json()) as PreviewResponse;
    },
  });

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    const list = options?.customers ?? [];
    return (q ? list.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : list).slice(0, 300);
  }, [options, customerQuery]);

  const current = KINDS.find((k) => k.key === kind)!;
  const downloadHref = `/api/reports/stats?${params.toString()}&format=xlsx`;

  return (
    <div className="glass-card border border-white/10 p-5 space-y-5 max-w-4xl">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm font-semibold transition-all",
              kind === k.key ? "border-amber-500/60 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[0.03] text-ink hover:bg-white/[0.08]"
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted2">{current.hint}</p>

      <div className="flex flex-wrap items-end gap-4">
        {kind !== "invoices" ? (
          <label className="flex flex-col gap-1 text-xs text-muted2">
            Thời gian chưa mua
            <select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)} className={selectCls}>
              {BUCKETS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <div className="flex flex-col gap-1 text-xs text-muted2">
              Khách hàng
              <div className="flex gap-2">
                <input
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Gõ để tìm khách..."
                  className={cn(selectCls, "w-40")}
                />
                <select value={customer} onChange={(e) => setCustomer(e.target.value)} className={cn(selectCls, "max-w-xs")}>
                  <option value="ALL">{isAdmin && !employeeId ? "Tất cả khách hàng" : "Tất cả khách của tôi"}</option>
                  {filteredCustomers.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} ({c.code}) — {c.invoiceCount} HĐ
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted2">
              Thời gian (theo ngày hoá đơn)
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
                <option value="ALL">Toàn bộ</option>
                {(options?.months ?? []).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m.slice(5)}/{m.slice(0, 4)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {isAdmin && (
          <div className="flex flex-col gap-1 text-xs text-muted2">
            Nhân viên
            <EmployeeFilterSelect value={employeeId} onChange={(id) => { setEmployeeId(id); setCustomer("ALL"); }} />
          </div>
        )}
        <a
          href={downloadHref}
          className={cn(
            "flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-amber-foreground hover:bg-amber-400 transition-all",
            (!data || data.count === 0) && "opacity-50"
          )}
        >
          <Download className="h-4 w-4" />
          Tải Excel
        </a>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-ink">
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-amber-400" />}
          {isError && <span className="text-alert">Không lập được thống kê, thử lại sau.</span>}
          {data && !isFetching && <Summary data={data} kind={kind} />}
        </div>
        {data && data.sample.length > 0 && <SampleTable kind={kind} rows={data.sample} total={data.count} />}
        {data && data.count === 0 && !isFetching && <p className="text-xs text-muted2">Không có dữ liệu thoả điều kiện.</p>}
      </div>
    </div>
  );
}

function Summary({ data, kind }: { data: PreviewResponse; kind: Kind }) {
  if (kind === "dormant-customers") {
    return <span>Có <strong className="text-amber-300">{data.count}</strong> khách hàng thoả điều kiện — {data.bucketLabel}.</span>;
  }
  if (kind === "dormant-items") {
    return <span>Có <strong className="text-amber-300">{data.count}</strong> mã hàng của <strong className="text-amber-300">{data.customers}</strong> khách thoả điều kiện — {data.bucketLabel}.</span>;
  }
  return (
    <span>
      Có <strong className="text-amber-300">{data.count}</strong> hoá đơn — tổng {formatCurrencyVND(data.totals?.total ?? 0)}, còn lại{" "}
      <strong className="text-alert">{formatCurrencyVND(data.totals?.remaining ?? 0)}</strong> (đã thanh toán {data.counts?.paid ?? 0}, một phần {data.counts?.partial ?? 0}, chưa {data.counts?.unpaid ?? 0}).
    </span>
  );
}

function SampleTable({ kind, rows, total }: { kind: Kind; rows: Record<string, string | number | null>[]; total: number }) {
  const heads =
    kind === "dormant-customers"
      ? ["Mã khách", "Tên khách hàng", "NVKD", "Ngày PO cuối", "Tháng chưa mua", "Doanh số 6 tháng"]
      : kind === "dormant-items"
        ? ["Khách hàng", "Mã hàng", "Tên hàng", "Ngày mua cuối", "Tháng chưa mua"]
        : ["Số hoá đơn", "Ngày hoá đơn", "Khách hàng", "Tổng số tiền", "Còn lại", "Trạng thái"];
  const cell = (r: Record<string, string | number | null>): (string | number)[] =>
    kind === "dormant-customers"
      ? [String(r.code), String(r.name), String(r.ownerName ?? ""), formatDateVN(String(r.lastPoDate)), Number(r.monthsSince), formatCurrencyVND(Number(r.historyValue))]
      : kind === "dormant-items"
        ? [String(r.customerName), String(r.itemCode), String(r.itemName), formatDateVN(String(r.lastPoDate)), Number(r.monthsSince)]
        : [String(r.invoiceNumber), r.invoiceDate ? formatDateVN(String(r.invoiceDate)) : "—", String(r.customerName), formatCurrencyVND(Number(r.total)), formatCurrencyVND(Number(r.remaining)), String(r.status)];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="text-muted-foreground border-b border-white/5">
          <tr>
            {heads.map((h) => (
              <th key={h} className="text-left font-medium px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r, i) => (
            <tr key={i}>
              {cell(r).map((v, j) => (
                <td key={j} className="px-3 py-1.5 text-ink2 max-w-[18rem] truncate" title={String(v)}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && <p className="px-3 pt-2 text-[11px] text-muted2">Hiện {rows.length} dòng đầu — tải Excel để xem đủ {total} dòng.</p>}
    </div>
  );
}
