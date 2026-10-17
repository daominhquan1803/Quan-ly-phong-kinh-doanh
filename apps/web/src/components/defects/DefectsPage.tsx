"use client";

import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronDown, ChevronUp, Search, Lock, LockOpen, Pencil, Trash2 } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import { DefectForm } from "./DefectForm";
import type { DefectRow } from "./types";

const fmtQty = (s: string | null) => (s == null ? "—" : Number(s).toLocaleString("vi-VN"));
const thisMonth = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);

/**
 * Trang Báo cáo hàng lỗi. canEdit = quản trị (Admin kinh doanh / quản trị hệ thống) lập, sửa, đóng biên bản;
 * canManage = quản trị hệ thống (mở lại, xoá). NVKD chỉ xem biên bản mình chịu trách nhiệm.
 */
export function DefectsPage({ canEdit, canManage }: { canEdit: boolean; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"OPEN" | "CLOSED" | "ALL">("ALL");
  const [month, setMonth] = useState(thisMonth());
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DefectRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const key = ["defects", status, month, q];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const p = new URLSearchParams({ status, ...(month ? { month } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
      const res = await fetch(`/api/defects?${p}`);
      if (!res.ok) throw new Error("Không tải được biên bản");
      return res.json() as Promise<{ defects: DefectRow[] }>;
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["defects"] });
  const defects = data?.defects ?? [];
  const openCount = defects.filter((d) => d.status === "OPEN").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {(["ALL", "OPEN", "CLOSED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === s ? "bg-white/10 text-white" : "text-muted2 hover:text-ink")}
            >
              {s === "ALL" ? "Tất cả" : s === "OPEN" ? "Đang mở" : "Đã đóng"}
            </button>
          ))}
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="text-sm bg-card text-ink rounded-xl border border-white/10 py-2 px-3 font-mono"
          title="Tháng lập biên bản (để trống = mọi tháng)"
        />
        <button onClick={() => setMonth("")} className="text-xs text-muted2 hover:text-ink">
          Mọi tháng
        </button>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm số biên bản, khách hàng, mặt hàng..."
            className="w-full text-sm bg-card text-ink rounded-xl border border-white/10 py-2 pl-9 pr-3 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        {canEdit && !creating && !editing && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-amber-foreground hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" /> Lập biên bản
          </button>
        )}
      </div>

      {(creating || editing) && (
        <DefectForm
          initial={editing}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onDone={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      <div className="glass-card border border-white/10 overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/10 text-xs text-muted2">
          {isLoading ? "Đang tải..." : `${defects.length} biên bản · ${openCount} đang mở`}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted2 border-b border-white/10">
              <th className="text-left font-medium px-4 py-2.5">Số BB</th>
              <th className="text-left font-medium px-4 py-2.5">Ngày lập</th>
              <th className="text-left font-medium px-4 py-2.5">Khách hàng</th>
              <th className="text-left font-medium px-4 py-2.5">Phiếu / ngày giao</th>
              <th className="text-left font-medium px-4 py-2.5">Mặt hàng lỗi</th>
              <th className="text-left font-medium px-4 py-2.5">Chịu trách nhiệm</th>
              <th className="text-left font-medium px-4 py-2.5">Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {defects.length === 0 && !isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted2">
                  Chưa có biên bản nào.
                </td>
              </tr>
            )}
            {defects.map((d) => (
              <Fragment key={d.id}>
                <tr className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
                  <td className="px-4 py-2.5 font-mono text-amber-400 whitespace-nowrap">{d.reportNumber}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDateVN(d.reportDate)}</td>
                  <td className="px-4 py-2.5">
                    <p>{d.customerName}</p>
                    {d.customerCode && <p className="text-[11px] font-mono text-muted2">{d.customerCode}</p>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {d.shipmentSlip ? <p className="font-mono text-xs">{d.shipmentSlip.slipNumber}</p> : null}
                    <p className="text-xs text-muted2">{formatDateVN(d.deliveryDate)}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    {d.items.slice(0, 2).map((i) => (
                      <p key={i.id} className="text-xs">
                        {i.itemName} — <b>{fmtQty(i.defectQty)}</b> {i.unit ?? ""}
                      </p>
                    ))}
                    {d.items.length > 2 && <p className="text-[11px] text-muted2">+{d.items.length - 2} mặt hàng</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {d.responsibles.map((r) => r.user.name).join(", ") || "—"}
                    {d.otherResponsible && <p className="text-muted2">{d.otherResponsible}</p>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        d.status === "OPEN" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
                      )}
                    >
                      {d.status === "OPEN" ? "Đang mở" : "Đã đóng"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted2">{expanded === d.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
                </tr>
                {expanded === d.id && (
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <td colSpan={8} className="px-4 py-4">
                      <DefectDetail
                        d={d}
                        canEdit={canEdit}
                        canManage={canManage}
                        onEdit={() => {
                          setEditing(d);
                          setCreating(false);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        onChanged={refresh}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DefectDetail({ d, canEdit, canManage, onEdit, onChanged }: { d: DefectRow; canEdit: boolean; canManage: boolean; onEdit: () => void; onChanged: () => void }) {
  const [closing, setClosing] = useState(false);
  const [resolution, setResolution] = useState("");
  const [invoiceAdjusted, setInvoiceAdjusted] = useState<boolean | null>(null);
  const [invoiceNumbers, setInvoiceNumbers] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(method: string, url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Có lỗi xảy ra");
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full text-sm bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted2">Thông tin lỗi</p>
            <p className="whitespace-pre-wrap text-sm">{d.description}</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted2">
                <th className="text-left font-medium py-1">Mã hàng</th>
                <th className="text-left font-medium py-1">Tên hàng</th>
                <th className="text-right font-medium py-1">SL giao</th>
                <th className="text-right font-medium py-1">SL lỗi</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id} className="border-t border-white/5">
                  <td className="py-1 font-mono text-amber-400">{i.itemCode ?? "—"}</td>
                  <td className="py-1">{i.itemName}</td>
                  <td className="py-1 text-right">
                    {fmtQty(i.deliveredQty)} {i.unit ?? ""}
                  </td>
                  <td className="py-1 text-right font-bold text-alert">
                    {fmtQty(i.defectQty)} {i.unit ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted2">Lập bởi {d.createdBy.name}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted2 mb-2">Hình ảnh lỗi ({d.photos.length})</p>
          {d.photos.length === 0 ? (
            <p className="text-xs text-muted2">Không có ảnh.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {d.photos.map((p) => (
                <div key={p.id} className="relative">
                  <a href={`/api/defects/photos/${p.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/defects/photos/${p.id}`} alt="Ảnh lỗi" className="h-28 w-28 rounded-lg object-cover border border-white/10" />
                  </a>
                  {canEdit && d.status === "OPEN" && (
                    <button
                      onClick={() => call("DELETE", `/api/defects/photos/${p.id}`)}
                      className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white hover:bg-red-600"
                      aria-label="Xoá ảnh"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {d.status === "CLOSED" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-3 text-sm space-y-1">
          <p className="font-semibold text-emerald-300">
            Đã đóng {formatDateVN(d.closedAt)} {d.closedBy ? `bởi ${d.closedBy.name}` : ""}
          </p>
          <p>
            <span className="text-muted2">Cách xử lý:</span> {d.resolution}
          </p>
          <p>
            <span className="text-muted2">Sửa hoá đơn bán hàng:</span>{" "}
            {d.invoiceAdjusted ? (
              <>
                <b>Có</b> — hoá đơn {d.adjustedInvoiceNumbers}: {d.invoiceAdjustNote}
              </>
            ) : (
              "Không"
            )}
          </p>
        </div>
      )}

      {closing && (
        <div className="rounded-xl border border-amber-500/30 p-4 space-y-3">
          <p className="text-sm font-semibold">Đóng biên bản {d.reportNumber}</p>
          <div className="space-y-1">
            <p className="text-xs text-muted2">Đã xử lý thế nào *</p>
            <textarea className={`${input} min-h-[70px]`} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-xs text-muted2">Có sửa hoá đơn bán hàng không? *</span>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={invoiceAdjusted === false} onChange={() => setInvoiceAdjusted(false)} /> Không
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={invoiceAdjusted === true} onChange={() => setInvoiceAdjusted(true)} /> Có
            </label>
          </div>
          {invoiceAdjusted && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted2">Sửa hoá đơn nào (số hoá đơn) *</p>
                <input className={input} value={invoiceNumbers} onChange={(e) => setInvoiceNumbers(e.target.value)} placeholder="vd 00002981, 00003050" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted2">Sửa như thế nào *</p>
                <input className={input} value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)} placeholder="vd điều chỉnh giảm 120 cái x 3.240đ" />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={async () => {
                const ok = await call("PATCH", `/api/defects/${d.id}`, {
                  action: "close",
                  resolution,
                  invoiceAdjusted,
                  adjustedInvoiceNumbers: invoiceNumbers || null,
                  invoiceAdjustNote: invoiceNote || null,
                });
                if (ok) setClosing(false);
              }}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Xác nhận đóng
            </button>
            <button onClick={() => setClosing(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-muted2">
              Huỷ
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {canEdit && d.status === "OPEN" && !closing && (
          <>
            <button onClick={onEdit} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
              <Pencil className="h-3.5 w-3.5" /> Sửa / thêm ảnh
            </button>
            <button
              onClick={() => setClosing(true)}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10"
            >
              <Lock className="h-3.5 w-3.5" /> Đóng biên bản
            </button>
          </>
        )}
        {canManage && d.status === "CLOSED" && (
          <button
            disabled={busy}
            onClick={() => call("PATCH", `/api/defects/${d.id}`, { action: "reopen" })}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            <LockOpen className="h-3.5 w-3.5" /> Mở lại
          </button>
        )}
        {canManage && (
          <button
            disabled={busy}
            onClick={() => {
              if (confirm(`Xoá biên bản ${d.reportNumber}? Không khôi phục được.`)) call("DELETE", `/api/defects/${d.id}`);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xoá
          </button>
        )}
      </div>
    </div>
  );
}
