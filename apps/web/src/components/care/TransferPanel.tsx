"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import type { OwnedCustomerRow } from "@/lib/customer-care-transfer";
import { TIER_STYLE, TIER_TEXT } from "./DuePlan";

const money = (n: number) => (n > 0 ? `${Math.round(n / 1e6).toLocaleString("vi-VN")} tr` : "—");
type Filter = "ALL" | "A" | "B" | "C" | "NGU" | "NONE";
const FILTERS: [Filter, string][] = [
  ["ALL", "Tất cả"],
  ["A", "Hạng A"],
  ["B", "Hạng B"],
  ["C", "Hạng C"],
  ["NGU", "Ngủ"],
  ["NONE", "Không mua 12 tháng / theo vụ-dự án"],
];
const PAGE = 100;

/** Chuyển hàng loạt khách đang đứng tên anh cho NVKD (chỉ quản trị hệ thống). Doanh số theo đơn không đổi. */
export function TransferPanel({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["care-transfer"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/customer-care/transfer");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được");
      return json as { rows: OwnedCustomerRow[]; employees: { id: string; name: string }[] };
    },
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [moveDebt, setMoveDebt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const filtered = useMemo(() => {
    const q = normalizeVN(search.trim());
    return rows.filter((r) => {
      if (filter === "NONE" ? r.tier !== null : filter !== "ALL" && r.tier !== filter) return false;
      return !q || normalizeVN(r.customerName).includes(q) || normalizeVN(r.customerCode).includes(q);
    });
  }, [rows, search, filter]);
  const shown = filtered.slice(0, limit);
  const pickedDebt = rows.filter((r) => picked.has(r.id)).reduce((s, r) => s + r.unpaidDebt, 0);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function transfer() {
    const empName = data?.employees.find((e) => e.id === target)?.name ?? "";
    if (!confirm(`Chuyển ${picked.size} khách cho ${empName}?${moveDebt ? " Công nợ đang đứng tên anh của các khách này cũng chuyển theo." : ""}`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer-care/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: target, customerIds: [...picked], moveDebt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không chuyển được");
      setMsg({ ok: true, text: `Đã chuyển ${json.transferred} khách cho ${empName}${json.debtMoved ? `, kèm ${json.debtMoved} hoá đơn công nợ` : ""}.` });
      setPicked(new Set());
      for (const k of ["care-transfer", "care-plan", "care-team", "care-overview", "care-eval"]) qc.invalidateQueries({ queryKey: [k] });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Không chuyển được" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200/30 p-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ArrowRightLeft className="h-4 w-4 text-amber-400" /> Chuyển khách của anh cho NVKD {data ? `(${rows.length} khách)` : ""}
        </span>
        <span className="text-xs text-amber-400">{open ? "Thu gọn" : "Mở"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Chỉ đổi người phụ trách hồ sơ khách (lịch chăm sóc, nhắc việc). Doanh số theo đơn đã ghi không đổi. Công nợ chỉ chuyển theo khi anh tick ô “Chuyển cả công nợ”.
          </p>
          {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
          {error && <p className="text-sm text-alert">{(error as Error).message}</p>}
          {data && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setLimit(PAGE);
                  }}
                  placeholder="Tìm mã hoặc tên khách"
                  className="w-56 rounded-lg border border-gray-200/40 bg-transparent px-3 py-1.5 text-xs text-ink"
                />
                {FILTERS.map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => {
                      setFilter(k);
                      setLimit(PAGE);
                    }}
                    className={cn("rounded-full border px-3 py-1 text-xs", filter === k ? "border-amber-400 bg-amber-500/15 font-semibold text-amber-400" : "border-gray-200/40 text-ink2")}
                  >
                    {l} ({rows.filter((r) => (k === "ALL" ? true : k === "NONE" ? r.tier === null : r.tier === k)).length})
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200/20 p-2.5">
                <span className="text-xs text-ink2">
                  Đã chọn <b className="text-amber-400">{picked.size}</b> khách
                  {pickedDebt > 0 && <span className="text-muted-foreground"> · công nợ còn {money(pickedDebt)}</span>}
                </span>
                <button onClick={() => setPicked(new Set([...picked, ...filtered.map((r) => r.id)]))} className="rounded-lg border border-gray-200/40 px-2.5 py-1 text-xs text-ink2 hover:bg-white/5">
                  Chọn {filtered.length} khách đang lọc
                </button>
                {picked.size > 0 && (
                  <button onClick={() => setPicked(new Set())} className="rounded-lg border border-gray-200/40 px-2.5 py-1 text-xs text-ink2 hover:bg-white/5">
                    Bỏ chọn
                  </button>
                )}
                <select value={target} onChange={(e) => setTarget(e.target.value)} className="ml-auto rounded-lg border border-gray-200/40 bg-card px-2.5 py-1 text-xs text-ink" aria-label="Chuyển cho">
                  <option value="">Chuyển cho...</option>
                  {data.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-ink2">
                  <input type="checkbox" checked={moveDebt} onChange={(e) => setMoveDebt(e.target.checked)} /> Chuyển cả công nợ
                </label>
                <button disabled={busy || !target || picked.size === 0} onClick={transfer} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-40">
                  {busy ? "Đang chuyển..." : `Chuyển ${picked.size || ""} khách`}
                </button>
              </div>
              {msg && <p className={cn("text-sm", msg.ok ? "text-emerald-300" : "text-alert")}>{msg.text}</p>}

              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="w-8 py-1.5" />
                      <th className="py-1.5 text-left font-medium">Mã</th>
                      <th className="py-1.5 text-left font-medium">Khách</th>
                      <th className="py-1.5 text-left font-medium">Hạng</th>
                      <th className="py-1.5 text-right font-medium">Đơn 12 tháng</th>
                      <th className="py-1.5 text-right font-medium">Doanh số</th>
                      <th className="py-1.5 text-right font-medium">Đơn cuối</th>
                      <th className="py-1.5 text-right font-medium">Công nợ còn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {shown.map((r) => (
                      <tr key={r.id} className={picked.has(r.id) ? "bg-amber-500/5" : ""}>
                        <td className="py-1.5">
                          <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Chọn ${r.customerName}`} />
                        </td>
                        <td className="py-1.5 pr-2 font-mono font-semibold text-amber-400">
                          <button onClick={() => onOpenCustomer(r.id)} className="hover:underline">
                            {r.customerCode}
                          </button>
                        </td>
                        <td className="max-w-[300px] truncate py-1.5 pr-2 text-ink" title={r.customerName}>
                          {r.customerName}
                        </td>
                        <td className="py-1.5">
                          {r.tier ? (
                            <span className={cn("rounded border px-1.5 text-[11px] font-bold", TIER_STYLE[r.tier])}>{TIER_TEXT[r.tier]}</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">{r.pattern === "REGULAR" ? "không mua" : r.pattern === "SEASONAL" ? "theo vụ" : "dự án"}</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-mono">{r.orders12}</td>
                        <td className="py-1.5 text-right font-mono">{money(r.value12)}</td>
                        <td className="py-1.5 text-right text-muted-foreground">{r.lastOrderAt ? formatDateVN(r.lastOrderAt) : "—"}</td>
                        <td className={cn("py-1.5 text-right font-mono", r.unpaidDebt > 0 ? "text-amber-400" : "text-muted-foreground")}>{money(r.unpaidDebt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && <p className="py-3 text-sm text-muted-foreground">Không có khách phù hợp.</p>}
                {filtered.length > shown.length && (
                  <button onClick={() => setLimit(limit + PAGE)} className="mt-2 text-xs text-amber-400 hover:underline">
                    Xem thêm {Math.min(PAGE, filtered.length - shown.length)} khách ({filtered.length - shown.length} còn lại)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
