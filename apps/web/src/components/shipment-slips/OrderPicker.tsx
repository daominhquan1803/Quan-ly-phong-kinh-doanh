"use client";

import { useState, useEffect } from "react";

interface OrderOption {
  id: string;
  orderCode: string;
  customerName: string;
  poCode: string | null;
}

export function OrderPicker({
  value,
  onChange,
  initialQuery,
}: {
  value: string | null;
  onChange: (orderId: string | null, label?: string) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [options, setOptions] = useState<OrderOption[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/orders?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const json = await res.json();
      setOptions((json.orders ?? []).slice(0, 8));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <input
        value={value && selectedLabel ? selectedLabel : query}
        onChange={(e) => {
          onChange(null);
          setSelectedLabel(null);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Tìm theo mã đơn, khách hàng, PO..."
        className="w-full text-sm rounded-md border border-gray-200 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setSelectedLabel(null);
            setQuery("");
          }}
          className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-brandRed-600"
        >
          Bỏ chọn
        </button>
      )}
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-card shadow-card max-h-56 overflow-y-auto">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  onChange(o.id);
                  setSelectedLabel(`${o.orderCode} — ${o.customerName}`);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-ink">{o.orderCode}</span> — {o.customerName}
                {o.poCode && <span className="text-muted-foreground"> (PO {o.poCode})</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
