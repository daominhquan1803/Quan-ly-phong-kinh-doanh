"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Search, X, Package } from "lucide-react";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";

interface ItemRow {
  itemKey: string;
  itemCode: string | null;
  itemName: string;
  customers: string[];
  totalQuantity: number;
  totalValue: number;
  lineCount: number;
  lastOrderDate: string | null;
  inventoryQty: number | null;
}

interface ItemLine {
  id: string;
  orderCode: string;
  customerName: string;
  customerCode: string | null;
  orderDate: string | null;
  status: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

function ItemDetailModal({ item, onClose }: { item: ItemRow; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["item-lines", item.itemKey],
    queryFn: async () => {
      const res = await fetch(`/api/items/${encodeURIComponent(item.itemKey)}`);
      if (!res.ok) throw new Error("Không tải được chi tiết");
      return (await res.json()) as { lines: ItemLine[] };
    },
  });

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">{item.itemName}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.itemCode ?? "(không mã)"} · {item.lineCount} dòng đơn · {item.customers.length} khách hàng
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-ink" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <p className="p-3 text-xs text-muted-foreground">Đang tải...</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Đơn hàng</th>
                  <th className="px-3 py-2 text-left font-medium">Khách hàng</th>
                  <th className="px-3 py-2 text-left font-medium">Ngày đặt</th>
                  <th className="px-3 py-2 text-right font-medium">SL</th>
                  <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
                  <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(data?.lines ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 font-mono text-ink">{l.orderCode}</td>
                    <td className="px-3 py-2 text-ink">{l.customerName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateVN(l.orderDate)}</td>
                    <td className="px-3 py-2 text-right text-ink">{l.quantity}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrencyVND(l.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink">{formatCurrencyVND(l.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Danh sách mã hàng gộp từ đơn hàng (đồng bộ sẵn từ AMIS) — lọc theo mã/tên hàng và khách hàng. */
export function ItemsPanel() {
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [selected, setSelected] = useState<ItemRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error("Không tải được danh sách hàng hóa");
      return (await res.json()) as { items: ItemRow[] };
    },
  });

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const nSearch = normalizeVN(search);
    const nCustomer = normalizeVN(customerFilter);
    return items.filter((it) => {
      const matchSearch =
        !nSearch || normalizeVN(it.itemCode ?? "").includes(nSearch) || normalizeVN(it.itemName).includes(nSearch);
      const matchCustomer = !nCustomer || it.customers.some((c) => normalizeVN(c).includes(nCustomer));
      return matchSearch && matchCustomer;
    });
  }, [data, search, customerFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã hàng hoặc tên hàng..."
            className="input pl-9"
          />
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            placeholder="Tìm theo tên khách hàng..."
            className="input pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Đang tải...</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">Không có mã hàng nào khớp.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.03] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Mã hàng</th>
                <th className="px-3 py-2 text-left font-medium">Tên hàng</th>
                <th className="px-3 py-2 text-left font-medium">Khách hàng</th>
                <th className="px-3 py-2 text-right font-medium">Tổng SL</th>
                <th className="px-3 py-2 text-right font-medium">Tổng giá trị</th>
                <th className="px-3 py-2 text-right font-medium">Tồn kho</th>
                <th className="px-3 py-2 text-left font-medium">Đơn gần nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((it) => (
                <tr
                  key={it.itemKey}
                  onClick={() => setSelected(it)}
                  className="cursor-pointer hover:bg-white/[0.04]"
                >
                  <td className="px-3 py-2 font-mono text-ink">{it.itemCode ?? "—"}</td>
                  <td className="px-3 py-2 text-ink">
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
                      {it.itemName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {it.customers.length <= 2 ? it.customers.join(", ") : `${it.customers.slice(0, 2).join(", ")} +${it.customers.length - 2}`}
                  </td>
                  <td className="px-3 py-2 text-right text-ink">{it.totalQuantity}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatCurrencyVND(it.totalValue)}</td>
                  <td className="px-3 py-2 text-right text-ink">{it.inventoryQty ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDateVN(it.lastOrderDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <ItemDetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
