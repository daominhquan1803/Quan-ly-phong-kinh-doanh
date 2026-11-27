"use client";

import { useQuery } from "@tanstack/react-query";

interface Report {
  syncedAt: string | null;
  lsxRows: number;
  openProduction: number;
  matched: number;
  trading: number;
  withoutLsx: { poCode: string; itemCode: string | null; itemName: string | null; customerCode: string | null; salesEmployeeName: string | null; remainingQty: number | null; dueOn: string | null }[];
  unmatchedLsx: { lsxNo: string; poCodes: string[]; itemCode: string; customerName: string | null }[];
}

const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("vi-VN") : "—");

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="mt-2 max-h-96 overflow-auto">
      <table className="min-w-full text-xs text-ink2">
        <thead>
          <tr className="text-left text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap py-1 pr-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/5">
              {r.map((c, j) => (
                <td key={j} className="whitespace-nowrap py-1 pr-3">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bảng đối chiếu PO còn nợ hàng với lệnh sản xuất — chỉ admin, để kiểm tra số liệu trước khi hiện tiến độ. */
export function ProductionMatchPanel() {
  const { data, isError } = useQuery({
    queryKey: ["shipping-status", "production"],
    queryFn: async () => {
      const res = await fetch("/api/shipping-status/production");
      if (!res.ok) throw new Error("Không đối chiếu được lệnh sản xuất");
      return res.json() as Promise<Report>;
    },
  });

  if (isError) return <p className="text-sm text-alert">Không đối chiếu được lệnh sản xuất.</p>;
  if (!data) return null;

  return (
    <details className="rounded-2xl border border-white/10 bg-navy-900/60 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">
        Đối chiếu lệnh sản xuất:{" "}
        {data.syncedAt
          ? `${data.matched}/${data.openProduction} dòng hàng sản xuất còn nợ đã có lệnh · cập nhật ${new Date(data.syncedAt).toLocaleString("vi-VN")}`
          : "chưa đồng bộ được dữ liệu"}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {data.lsxRows} dòng lệnh sản xuất · {data.trading} dòng hàng thương mại (AA, ST) còn nợ, chờ dữ liệu phòng kế hoạch.
      </p>
      <h3 className="mt-3 text-xs font-bold text-ink">Dòng PO chưa tìm thấy lệnh sản xuất ({data.withoutLsx.length})</h3>
      <Table
        head={["Số PO", "Mã hàng", "Tên hàng", "Khách", "NVKD", "SL còn nợ", "Hạn giao"]}
        rows={data.withoutLsx.map((l) => [l.poCode, l.itemCode ?? "—", l.itemName ?? "—", l.customerCode ?? "—", l.salesEmployeeName ?? "—", l.remainingQty?.toLocaleString("vi-VN") ?? "—", date(l.dueOn)])}
      />
      <h3 className="mt-3 text-xs font-bold text-ink">Lệnh sản xuất chưa xong không khớp PO nào ({data.unmatchedLsx.length})</h3>
      <Table head={["Số lệnh", "Số PO", "Mã hàng", "Khách"]} rows={data.unmatchedLsx.map((r) => [r.lsxNo, r.poCodes.join(" + "), r.itemCode, r.customerName ?? "—"])} />
    </details>
  );
}
