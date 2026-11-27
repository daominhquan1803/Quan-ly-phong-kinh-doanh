"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface DupRow {
  id: string;
  customerCode: string;
  customerName: string;
  salesEmployeeName: string | null;
  invoices: number;
  orders: number;
  careLogs: number;
}

const weight = (r: DupRow) => r.invoices + r.orders + r.careLogs;

function Group({ rows, canManage, onDone }: { rows: DupRow[]; canManage: boolean; onDone: (message: string, ok: boolean) => void }) {
  // Mặc định mã chính = mã đang có nhiều dữ liệu nhất.
  const [primaryId, setPrimaryId] = useState(() => [...rows].sort((a, b) => weight(b) - weight(a))[0].id);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const primary = rows.find((r) => r.id === primaryId) ?? rows[0];
  const secondaries = rows.filter((r) => r.id !== primary.id && !skipped.includes(r.id));

  async function merge() {
    const codes = secondaries.map((r) => r.customerCode).join(", ");
    if (!confirm(`Gộp ${codes} vào ${primary.customerCode}?\n\nLịch sử chăm sóc chuyển sang ${primary.customerCode}. Hoá đơn và đơn hàng giữ nguyên mã.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId: primary.id, secondaryIds: secondaries.map((r) => r.id) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gộp thất bại");
      onDone(`Đã gộp ${codes} vào ${primary.customerCode}.`, true);
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Gộp thất bại", false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200/80 bg-navy-50/50 p-3">
      <div className="mb-2 text-sm font-semibold text-ink">{rows[0].customerName}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs text-ink2">
          <thead>
            <tr className="text-left text-muted-foreground">
              {canManage && <th className="pr-3 py-1">Mã chính</th>}
              {canManage && <th className="pr-3 py-1">Gộp</th>}
              <th className="pr-3 py-1">Mã khách</th>
              <th className="pr-3 py-1">NVKD</th>
              <th className="pr-3 py-1 text-right">Hoá đơn</th>
              <th className="pr-3 py-1 text-right">Đơn hàng</th>
              <th className="py-1 text-right">Chăm sóc</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {canManage && (
                  <td className="pr-3 py-1">
                    <input type="radio" aria-label={`Chọn ${r.customerCode} làm mã chính`} checked={r.id === primary.id} onChange={() => setPrimaryId(r.id)} className="accent-amber-500" />
                  </td>
                )}
                {canManage && (
                  <td className="pr-3 py-1">
                    {r.id !== primary.id && (
                      <input
                        type="checkbox"
                        aria-label={`Gộp ${r.customerCode} vào mã chính`}
                        checked={!skipped.includes(r.id)}
                        onChange={() => setSkipped((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                        className="accent-amber-500"
                      />
                    )}
                  </td>
                )}
                <td className="pr-3 py-1 font-mono font-semibold text-amber-400">{r.customerCode}</td>
                <td className="pr-3 py-1 whitespace-nowrap">{r.salesEmployeeName ?? "—"}</td>
                <td className="pr-3 py-1 text-right font-mono">{r.invoices}</td>
                <td className="pr-3 py-1 text-right font-mono">{r.orders}</td>
                <td className="py-1 text-right font-mono">{r.careLogs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage && (
        <button
          onClick={merge}
          disabled={busy || secondaries.length === 0}
          className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-amber-foreground hover:bg-amber-400 disabled:opacity-40"
        >
          {busy ? "Đang gộp..." : `Gộp ${secondaries.length} mã vào ${primary.customerCode}`}
        </button>
      )}
    </div>
  );
}

/** Danh sách nhóm khách trùng tên. Chỉ quản trị hệ thống gộp được; người khác chỉ xem. */
export function DuplicateCustomers({ canManage, onDone }: { canManage: boolean; onDone: (message: string, ok: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["customers", "duplicates"],
    queryFn: async () => {
      const res = await fetch("/api/customers/duplicates");
      if (!res.ok) throw new Error("Không tải được danh sách khách trùng");
      return res.json() as Promise<{ groups: DupRow[][] }>;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tìm khách trùng...</p>;
  if (isError || !data) return <p className="text-sm text-alert">Không tải được danh sách khách trùng.</p>;
  if (data.groups.length === 0) return <p className="text-sm text-muted-foreground">Không còn khách trùng tên.</p>;

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-navy-900/60 p-4">
      <p className="text-xs text-muted-foreground">
        {data.groups.length} nhóm trùng tên. Kiểm tra trước khi gộp: chi nhánh khác nhau có thể trùng tên — bỏ dấu tích ở mã không phải trùng.
      </p>
      {data.groups.map((g) => (
        <Group
          key={g.map((r) => r.id).join()}
          rows={g}
          canManage={canManage}
          onDone={(message, ok) => {
            onDone(message, ok);
            if (ok) queryClient.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      ))}
    </div>
  );
}
