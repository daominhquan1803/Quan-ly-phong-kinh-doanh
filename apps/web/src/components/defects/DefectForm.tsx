"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, ImagePlus } from "lucide-react";
import { formatDateVN } from "@/lib/utils";
import { compressImage } from "@/lib/client-image";
import { DEFECT_OTHER_PARTIES } from "@/lib/defect-report-shared";
import type { DefectRow } from "./types";

interface CustomerOption {
  customerCode: string;
  customerName: string;
}
interface SlipOption {
  id: string;
  slipNumber: string;
  slipDate: string | null;
  customerName: string | null;
  items: { id: string; itemCode: string | null; itemName: string; unit: string | null; qtyActual: string | null; qtyRequested: string | null; poSaleNumber: string | null }[];
}
interface Person {
  id: string;
  name: string;
  kind: "SALES" | "ADMIN";
}
interface ItemDraft {
  key: string;
  slipItemId: string | null;
  itemCode: string;
  itemName: string;
  unit: string;
  deliveredQty: string;
  defectQty: string;
}

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const ymdOf = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : "");
let seq = 0;
const newKey = () => `k${++seq}`;

/** Form lập / sửa biên bản hàng lỗi. Sau khi lưu thì tải các ảnh đã chọn lên. */
export function DefectForm({ initial, onDone, onCancel }: { initial?: DefectRow | null; onDone: () => void; onCancel: () => void }) {
  const [reportNumber, setReportNumber] = useState(initial?.reportNumber ?? "");
  const [reportDate, setReportDate] = useState(initial ? ymdOf(initial.reportDate) : today());
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [customerCode, setCustomerCode] = useState(initial?.customerCode ?? "");
  const [slipId, setSlipId] = useState<string | null>(initial?.shipmentSlip?.id ?? null);
  const [deliveryDate, setDeliveryDate] = useState(initial?.deliveryDate ? ymdOf(initial.deliveryDate) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.map((i) => ({
      key: newKey(),
      slipItemId: i.slipItemId,
      itemCode: i.itemCode ?? "",
      itemName: i.itemName,
      unit: i.unit ?? "",
      deliveredQty: i.deliveredQty ?? "",
      defectQty: i.defectQty,
    })) ?? []
  );
  const [responsibleIds, setResponsibleIds] = useState<string[]>(initial?.responsibles.map((r) => r.user.id) ?? []);
  const [otherResponsible, setOtherResponsible] = useState(initial?.otherResponsible ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCustomerList, setShowCustomerList] = useState(false);

  const { data: customersData } = useQuery({
    queryKey: ["customers-for-defects"],
    queryFn: async () => {
      const res = await fetch("/api/customers");
      if (!res.ok) throw new Error("Không tải được khách hàng");
      return res.json() as Promise<{ customers: CustomerOption[] }>;
    },
    staleTime: 5 * 60_000,
  });
  const { data: peopleData } = useQuery({
    queryKey: ["defect-people"],
    queryFn: async () => {
      const res = await fetch("/api/defects/lookup?kind=people");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ people: Person[] }>;
    },
    staleTime: 5 * 60_000,
  });
  const { data: slipsData, isFetching: slipsLoading } = useQuery({
    queryKey: ["defect-slips", customerName, customerCode],
    queryFn: async () => {
      const p = new URLSearchParams({ kind: "slips", customer: customerName, customerCode });
      const res = await fetch(`/api/defects/lookup?${p}`);
      if (!res.ok) throw new Error("Không tải được phiếu đi hàng");
      return res.json() as Promise<{ slips: SlipOption[] }>;
    },
    enabled: customerName.trim().length >= 2 || !!customerCode,
  });

  const customerMatches = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q || !customersData) return [];
    return customersData.customers
      .filter((c) => c.customerName.toLowerCase().includes(q) || c.customerCode.toLowerCase().includes(q))
      .slice(0, 12);
  }, [customerName, customersData]);

  const selectedSlip = slipsData?.slips.find((s) => s.id === slipId) ?? null;
  useEffect(() => {
    if (selectedSlip && !deliveryDate) setDeliveryDate(ymdOf(selectedSlip.slipDate));
  }, [selectedSlip, deliveryDate]);

  function toggleSlipItem(it: SlipOption["items"][number]) {
    setItems((cur) =>
      cur.some((x) => x.slipItemId === it.id)
        ? cur.filter((x) => x.slipItemId !== it.id)
        : [
            ...cur,
            {
              key: newKey(),
              slipItemId: it.id,
              itemCode: it.itemCode ?? "",
              itemName: it.itemName,
              unit: it.unit ?? "",
              deliveredQty: it.qtyActual ?? it.qtyRequested ?? "",
              defectQty: "",
            },
          ]
    );
  }
  const updateItem = (key: string, patch: Partial<ItemDraft>) => setItems((cur) => cur.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        reportNumber,
        reportDate,
        customerCode: customerCode || null,
        customerName,
        shipmentSlipId: slipId,
        deliveryDate: deliveryDate || null,
        description,
        items: items.map((i) => ({
          slipItemId: i.slipItemId,
          itemCode: i.itemCode || null,
          itemName: i.itemName,
          unit: i.unit || null,
          deliveredQty: i.deliveredQty === "" ? null : Number(i.deliveredQty),
          defectQty: Number(i.defectQty),
        })),
        responsibleUserIds: responsibleIds,
        otherResponsible: otherResponsible || null,
      };
      const res = await fetch(initial ? `/api/defects/${initial.id}` : "/api/defects", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Lưu thất bại");
      const id = (json.defect as { id: string }).id;
      for (const f of files) {
        const blob = await compressImage(f);
        const fd = new FormData();
        fd.append("file", blob, f.name.replace(/\.\w+$/, "") + ".jpg");
        const up = await fetch(`/api/defects/${id}/photos`, { method: "POST", body: fd });
        if (!up.ok) {
          const j = await up.json().catch(() => ({}));
          throw new Error(`Đã lưu biên bản nhưng tải ảnh lỗi: ${j.error ?? up.status}`);
        }
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  const label = "text-xs font-semibold text-muted2";
  const input = "w-full text-sm bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500";
  const people = peopleData?.people ?? [];

  return (
    <div className="glass-card border border-amber-500/30 p-5 space-y-5">
      <h2 className="text-base font-bold text-ink">{initial ? `Sửa biên bản ${initial.reportNumber}` : "Lập biên bản hàng lỗi"}</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <p className={label}>Số biên bản *</p>
          <input className={input} value={reportNumber} onChange={(e) => setReportNumber(e.target.value)} placeholder="Theo số biên bản của công ty" />
        </div>
        <div className="space-y-1">
          <p className={label}>Ngày lập *</p>
          <input type="date" className={input} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        </div>
        <div className="space-y-1 relative">
          <p className={label}>Khách hàng *</p>
          <input
            className={input}
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setCustomerCode("");
              setSlipId(null);
              setShowCustomerList(true);
            }}
            onFocus={() => setShowCustomerList(true)}
            onBlur={() => setTimeout(() => setShowCustomerList(false), 150)}
            placeholder="Gõ tên hoặc mã khách"
          />
          {showCustomerList && customerMatches.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-white/10 bg-card shadow-lg">
              {customerMatches.map((c) => (
                <button
                  key={c.customerCode}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                  onMouseDown={() => {
                    setCustomerName(c.customerName);
                    setCustomerCode(c.customerCode);
                    setSlipId(null);
                    setShowCustomerList(false);
                  }}
                >
                  <span className="font-mono text-xs text-amber-400">{c.customerCode}</span> · {c.customerName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className={label}>Phiếu đi hàng (chọn để lấy mặt hàng) hoặc nhập ngày giao hàng *</p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={`${input} sm:w-96`}
            value={slipId ?? ""}
            onChange={(e) => {
              setSlipId(e.target.value || null);
              setDeliveryDate("");
            }}
          >
            <option value="">{slipsLoading ? "Đang tải phiếu..." : `— Không chọn phiếu (${slipsData?.slips.length ?? 0} phiếu của khách) —`}</option>
            {slipsData?.slips.map((s) => (
              <option key={s.id} value={s.id}>
                {s.slipNumber} · {formatDateVN(s.slipDate)} · {s.items.length} mặt hàng
              </option>
            ))}
          </select>
          <span className="text-xs text-muted2">Ngày giao</span>
          <input type="date" className={`${input} w-44`} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>
        {selectedSlip && (
          <div className="rounded-xl border border-white/10">
            <p className="px-3 py-2 text-xs text-muted2 border-b border-white/10">Tích mặt hàng bị lỗi trên phiếu {selectedSlip.slipNumber}:</p>
            {selectedSlip.items.map((it) => (
              <label key={it.id} className="flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-white/5 cursor-pointer">
                <input type="checkbox" checked={items.some((x) => x.slipItemId === it.id)} onChange={() => toggleSlipItem(it)} />
                <span className="font-mono text-xs text-amber-400 w-28 shrink-0">{it.itemCode ?? "—"}</span>
                <span className="flex-1">{it.itemName}</span>
                <span className="text-xs text-muted2">
                  SL giao {it.qtyActual ?? it.qtyRequested ?? "—"} {it.unit ?? ""}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={label}>Mặt hàng bị lỗi và số lượng lỗi *</p>
          <button
            type="button"
            onClick={() => setItems((c) => [...c, { key: newKey(), slipItemId: null, itemCode: "", itemName: "", unit: "", deliveredQty: "", defectQty: "" }])}
            className="flex items-center gap-1 text-xs text-amber-400 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm mặt hàng (nhập tay)
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted2">Chưa chọn mặt hàng nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted2">
                  <th className="text-left font-medium px-2 py-1">Mã hàng</th>
                  <th className="text-left font-medium px-2 py-1">Tên hàng</th>
                  <th className="text-left font-medium px-2 py-1">ĐVT</th>
                  <th className="text-right font-medium px-2 py-1">SL giao</th>
                  <th className="text-right font-medium px-2 py-1">SL lỗi *</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.key}>
                    <td className="px-1 py-1 w-32">
                      <input className={input} value={i.itemCode} disabled={!!i.slipItemId} onChange={(e) => updateItem(i.key, { itemCode: e.target.value })} />
                    </td>
                    <td className="px-1 py-1">
                      <input className={input} value={i.itemName} disabled={!!i.slipItemId} onChange={(e) => updateItem(i.key, { itemName: e.target.value })} />
                    </td>
                    <td className="px-1 py-1 w-20">
                      <input className={input} value={i.unit} disabled={!!i.slipItemId} onChange={(e) => updateItem(i.key, { unit: e.target.value })} />
                    </td>
                    <td className="px-1 py-1 w-28">
                      <input className={`${input} text-right`} inputMode="decimal" value={i.deliveredQty} onChange={(e) => updateItem(i.key, { deliveredQty: e.target.value })} />
                    </td>
                    <td className="px-1 py-1 w-28">
                      <input className={`${input} text-right border-amber-500/40`} inputMode="decimal" value={i.defectQty} onChange={(e) => updateItem(i.key, { defectQty: e.target.value })} />
                    </td>
                    <td className="px-1 py-1 w-8">
                      <button type="button" onClick={() => setItems((c) => c.filter((x) => x.key !== i.key))} className="text-muted2 hover:text-alert" aria-label="Bỏ mặt hàng">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className={label}>Thông tin lỗi *</p>
        <textarea className={`${input} min-h-[90px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả lỗi: hiện tượng, nguyên nhân sơ bộ, khách phản ánh..." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className={label}>Người chịu trách nhiệm (tính vào KPI tháng)</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = responsibleIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setResponsibleIds((c) => (on ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    on ? "border-amber-500/60 bg-amber-500/15 text-amber-300" : "border-white/10 text-ink hover:bg-white/5"
                  }`}
                >
                  {p.name} <span className="text-muted2">· {p.kind === "ADMIN" ? "Admin" : "NVKD"}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1">
          <p className={label}>Bộ phận khác chịu trách nhiệm (không tính KPI)</p>
          <select className={input} value={otherResponsible} onChange={(e) => setOtherResponsible(e.target.value)}>
            <option value="">— Không —</option>
            {DEFECT_OTHER_PARTIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <p className={label}>Hình ảnh lỗi (nếu có, tối đa 10 ảnh mỗi biên bản)</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-2 text-xs text-ink hover:bg-white/5">
          <ImagePlus className="h-4 w-4" />
          Chọn ảnh
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))} />
        </label>
        {files.length > 0 && <p className="text-xs text-muted2">{files.length} ảnh sẽ được tải lên khi lưu: {files.map((f) => f.name).join(", ")}</p>}
      </div>

      {error && <p className="text-sm text-alert">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-amber-foreground hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : initial ? "Lưu thay đổi" : "Lưu biên bản"}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-white/10 px-5 py-2 text-sm text-muted2 hover:bg-white/5">
          Huỷ
        </button>
      </div>
    </div>
  );
}
