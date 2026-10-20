"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import type { UnassignedRow } from "@/lib/customer-care-unassigned";

const money = (n: number) => (n > 0 ? `${Math.round(n / 1e6).toLocaleString("vi-VN")} tr` : "—");
const keyOf = (r: UnassignedRow) => r.customerId ?? `new:${r.customerCode}:${r.customerName}`;

/** Khách chưa có người phụ trách: anh chọn khách + người nhận rồi gán; khách chưa có hồ sơ thì tạo hồ sơ khi gán. */
export function UnassignedPanel({ canAssign, onOpenCustomer }: { canAssign: boolean; onOpenCustomer: (id: string) => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["care-unassigned"],
    queryFn: async () => {
      const res = await fetch("/api/customer-care/unassigned");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được");
      return json as { rows: UnassignedRow[]; employees: { id: string; name: string; role: string }[] };
    },
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const allKeys = rows.filter((r) => r.customerId || r.customerCode).map(keyOf);
  const toggle = (k: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function assign() {
    setBusy(true);
    setMsg(null);
    try {
      const chosen = rows.filter((r) => picked.has(keyOf(r)));
      const res = await fetch("/api/customer-care/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: target,
          customerIds: chosen.filter((r) => r.customerId).map((r) => r.customerId),
          profiles: chosen.filter((r) => !r.customerId && r.customerCode).map((r) => ({ customerCode: r.customerCode, customerName: r.customerName })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không phân được");
      setMsg(`Đã giao ${json.assigned + json.created} khách${json.created ? ` (tạo mới hồ sơ ${json.created})` : ""}${json.skipped?.length ? `; bỏ qua ${json.skipped.length}` : ""}.`);
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ["care-unassigned"] });
      qc.invalidateQueries({ queryKey: ["care-plan"] });
      qc.invalidateQueries({ queryKey: ["care-team"] });
      qc.invalidateQueries({ queryKey: ["care-overview"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không phân được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <UserPlus className="h-4 w-4 text-amber-400" /> Khách chưa có người phụ trách ({rows.length})
        </p>
        {canAssign && rows.length > 0 && data && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border border-gray-200/40 bg-card px-2.5 py-1 text-xs text-ink" aria-label="Giao cho">
              <option value="">Giao cho...</option>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !target || picked.size === 0}
              onClick={assign}
              className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-40"
            >
              {busy ? "Đang giao..." : `Giao ${picked.size || ""} khách`}
            </button>
          </div>
        )}
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Gồm hồ sơ khách chưa gán NVKD và khách có đơn 12 tháng qua nhưng chưa có hồ sơ (tạo hồ sơ khi giao). Cột “Gợi ý” là NVKD đứng tên nhiều đơn của khách nhất.
        {!canAssign && " Chỉ trưởng phòng (quản trị hệ thống) được phân."}
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {error && <p className="text-sm text-alert">{(error as Error).message}</p>}
      {msg && <p className="mb-2 text-sm text-emerald-300">{msg}</p>}
      {data && rows.length === 0 && <p className="text-sm text-emerald-300">Mọi khách đều đã có người phụ trách.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                {canAssign && (
                  <th className="w-8 py-1.5 text-left">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả"
                      checked={allKeys.length > 0 && allKeys.every((k) => picked.has(k))}
                      onChange={(e) => setPicked(e.target.checked ? new Set(allKeys) : new Set())}
                    />
                  </th>
                )}
                <th className="py-1.5 text-left font-medium">Mã</th>
                <th className="py-1.5 text-left font-medium">Khách</th>
                <th className="py-1.5 text-right font-medium">Đơn 12 tháng</th>
                <th className="py-1.5 text-right font-medium">Doanh số</th>
                <th className="py-1.5 text-right font-medium">Đơn cuối</th>
                <th className="py-1.5 pl-3 text-left font-medium">Gợi ý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => {
                const k = keyOf(r);
                const selectable = !!(r.customerId || r.customerCode);
                return (
                  <tr key={k}>
                    {canAssign && (
                      <td className="py-2">
                        <input type="checkbox" disabled={!selectable} checked={picked.has(k)} onChange={() => toggle(k)} aria-label={`Chọn ${r.customerName}`} />
                      </td>
                    )}
                    <td className="py-2 pr-2 font-mono font-semibold text-amber-400">
                      {r.customerId ? (
                        <button onClick={() => onOpenCustomer(r.customerId!)} className="hover:underline">
                          {r.customerCode}
                        </button>
                      ) : (
                        r.customerCode ?? <span className="text-alert">thiếu mã</span>
                      )}
                    </td>
                    <td className="max-w-[320px] truncate py-2 pr-2 text-ink" title={r.customerName}>
                      {r.customerName}
                      {!r.customerId && <span className="ml-1 rounded border border-sky-500/40 px-1 text-[10px] text-sky-300">chưa có hồ sơ</span>}
                    </td>
                    <td className="py-2 text-right font-mono">{r.orders12}</td>
                    <td className="py-2 text-right font-mono">{money(r.value12)}</td>
                    <td className="py-2 text-right text-muted-foreground">{r.lastOrderAt ? formatDateVN(r.lastOrderAt) : "—"}</td>
                    <td className={cn("py-2 pl-3", r.suggestedEmployeeName ? "text-ink2" : "text-muted-foreground")}>{r.suggestedEmployeeName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.some((r) => !r.customerId && !r.customerCode) && (
            <p className="mt-2 text-[11px] text-amber-400">Khách “thiếu mã” không giao được ở đây — vào trang Khách hàng tạo hồ sơ có mã trước.</p>
          )}
        </div>
      )}
    </div>
  );
}
