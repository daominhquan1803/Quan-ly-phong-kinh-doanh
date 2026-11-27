"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { ProductionAlert, ProductionStatus } from "@/lib/production-match";

interface Line {
  poCode: string;
  itemCode: string | null;
  itemName: string | null;
  customerCode: string | null;
  salesEmployeeName: string | null;
  remainingQty: number | null;
  dueOn: string | null;
  status: ProductionStatus;
  alert: ProductionAlert | null;
  eta: { date: string; time: string } | null;
  stage: string | null;
  lsxNos: string[];
  completedOn: string | null;
}
interface Data {
  syncedAt: string | null;
  lines: Line[];
  unmatchedLsx: { lsxNo: string; poCodes: string[]; itemCode: string; customerName: string | null }[];
}

const STATUS_LABEL: Record<ProductionStatus, string> = {
  WAITING: "Chờ sản xuất",
  RUNNING: "Đang sản xuất",
  DONE: "Đã xong, chờ giao",
  NO_LSX: "Chưa có lệnh sản xuất",
  TRADING: "Hàng thương mại",
  OTHER: "Chưa phân loại",
};
const ALERT_LABEL: Record<ProductionAlert, string> = { LATE: "Trễ", AT_RISK: "Nguy cơ trễ", DONE_NOT_SHIPPED: "Xong chưa giao" };
const ALERT_CLASS: Record<ProductionAlert, string> = { LATE: "text-alert", AT_RISK: "text-amber-400", DONE_NOT_SHIPPED: "text-emerald-400" };

type Filter = "ALL" | "LATE" | "AT_RISK" | "DONE" | "RUNNING" | "WAITING" | "NO_LSX" | "TRADING";
const FILTERS: [Filter, string][] = [
  ["ALL", "Tất cả"],
  ["LATE", "Trễ"],
  ["AT_RISK", "Nguy cơ trễ"],
  ["DONE", "Đã xong, chờ giao"],
  ["RUNNING", "Đang sản xuất"],
  ["WAITING", "Chờ sản xuất"],
  ["NO_LSX", "Chưa có lệnh"],
  ["TRADING", "Thương mại"],
];
const matches = (l: Line, f: Filter) => f === "ALL" || l.alert === f || l.status === f;

const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("vi-VN") : "—");

/** Tiến độ sản xuất của các dòng PO còn nợ hàng. NVKD chỉ thấy hàng của mình (lọc ở API). */
export function ProductionProgress({ isAdmin }: { isAdmin: boolean }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shipping-status", "production"],
    queryFn: async () => {
      const res = await fetch("/api/shipping-status/production");
      if (!res.ok) throw new Error("Không tải được tiến độ sản xuất");
      return res.json() as Promise<Data>;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải tiến độ sản xuất...</p>;
  if (isError || !data) return <p className="text-sm text-alert">Không tải được tiến độ sản xuất.</p>;
  if (!data.syncedAt) return <p className="text-sm text-muted-foreground">Chưa có dữ liệu từ trang sản xuất.</p>;

  const q = search.trim().toLowerCase();
  const shown = data.lines.filter(
    (l) => matches(l, filter) && (!q || [l.poCode, l.itemCode, l.itemName, l.customerCode, l.salesEmployeeName, ...l.lsxNos].some((v) => v?.toLowerCase().includes(q)))
  );
  const head = [...(isAdmin ? ["NVKD"] : []), "Khách", "Số PO", "Mã hàng", "Tên hàng", "SL còn nợ", "Hạn giao", "Tình trạng", "Số lệnh", "Công đoạn", "Dự kiến xong"];

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-navy-900/60 p-4">
      <p className="text-xs text-muted-foreground">
        Cập nhật từ trang sản xuất lúc {new Date(data.syncedAt).toLocaleString("vi-VN")}. Hàng thương mại (AA, ST) chờ dữ liệu phòng kế hoạch.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", filter === k ? "bg-amber-500 text-amber-foreground" : "bg-white/[0.05] text-ink2 hover:bg-white/10")}
          >
            {label} ({data.lines.filter((l) => matches(l, k)).length})
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm Số PO, mã hàng, khách, số lệnh..."
          aria-label="Tìm trong tiến độ sản xuất"
          className="min-w-[16rem] rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs text-ink"
        />
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <table className="min-w-full text-xs text-ink2">
          <thead>
            <tr className="text-left text-muted-foreground">
              {head.map((h) => (
                <th key={h} className="whitespace-nowrap py-1 pr-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((l, i) => (
              <tr key={i} className="border-t border-white/5 align-top">
                {isAdmin && <td className="whitespace-nowrap py-1 pr-3">{l.salesEmployeeName ?? "—"}</td>}
                <td className="whitespace-nowrap py-1 pr-3">{l.customerCode ?? "—"}</td>
                <td className="whitespace-nowrap py-1 pr-3 font-mono">{l.poCode}</td>
                <td className="whitespace-nowrap py-1 pr-3 font-mono text-amber-400">{l.itemCode ?? "—"}</td>
                <td className="min-w-[14rem] py-1 pr-3">{l.itemName ?? "—"}</td>
                <td className="py-1 pr-3 text-right font-mono">{l.remainingQty?.toLocaleString("vi-VN") ?? "—"}</td>
                <td className="whitespace-nowrap py-1 pr-3">{date(l.dueOn)}</td>
                <td className="whitespace-nowrap py-1 pr-3">
                  {STATUS_LABEL[l.status]}
                  {l.alert && <span className={cn("block font-bold", ALERT_CLASS[l.alert])}>{ALERT_LABEL[l.alert]}</span>}
                </td>
                <td className="py-1 pr-3 font-mono">{l.lsxNos.join(", ") || "—"}</td>
                <td className="py-1 pr-3">{l.stage ?? "—"}</td>
                <td className="whitespace-nowrap py-1">{l.eta ? `${l.eta.time} ${date(l.eta.date)}` : l.completedOn ? `Xong ${date(l.completedOn)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-3 text-xs text-muted-foreground">Không có dòng nào.</p>}
      </div>
      {isAdmin && data.unmatchedLsx.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold text-ink">Lệnh sản xuất chưa xong không khớp PO nào ({data.unmatchedLsx.length})</summary>
          <ul className="mt-2 max-h-64 overflow-auto text-xs text-ink2">
            {data.unmatchedLsx.map((r, i) => (
              <li key={i} className="border-t border-white/5 py-1">
                Lệnh {r.lsxNo} · {r.poCodes.join(" + ")} · {r.itemCode} · {r.customerName ?? "—"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
