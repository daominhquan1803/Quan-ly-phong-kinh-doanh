"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, X, Clock, AlertTriangle } from "lucide-react";
import { compressImage } from "@/lib/client-image";
import { confirmInfo } from "@/lib/order-confirmation";
import { cn } from "@/lib/utils";

export interface ConfirmOrder {
  id: string;
  orderCode: string;
  customerName: string;
  source: string;
  status: string;
  totalValue: string;
  amisCreatedAt: string | null;
  confirmation: { confirmedAt: string; photos: { id: string }[] } | null;
}

const MAX = 3;
const hhmm = (d: Date) => d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

function leftText(deadline: Date, now: Date) {
  const m = Math.max(0, Math.round((deadline.getTime() - now.getTime()) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}g${String(m % 60).padStart(2, "0")}` : `${m} phút`;
}

/** Ô "Xác nhận PKH/SX" của 1 đơn: trạng thái + (Admin) nút xác nhận kèm ảnh. */
export function ConfirmCell({ order, canConfirm }: { order: ConfirmOrder; canConfirm: boolean }) {
  const [open, setOpen] = useState(false);
  const info = confirmInfo({ ...order, confirmedAt: order.confirmation?.confirmedAt ?? null });
  const now = new Date();

  if (info.state === "NA") return <span className="text-muted2">—</span>;

  const photos = order.confirmation?.photos ?? [];
  return (
    <div className="space-y-1">
      {(info.state === "ON_TIME" || info.state === "LATE" || info.state === "DONE") && (
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", info.state === "LATE" ? "text-alert" : "text-emerald-300")}>
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            Đã xác nhận {info.confirmedAt ? hhmm(info.confirmedAt) : ""}
            {info.state === "LATE" && " — trễ hạn (lỗi Admin)"}
          </span>
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex gap-1">
          {photos.map((p) => (
            <a key={p.id} href={`/api/orders/confirmation-photos/${p.id}`} target="_blank" rel="noreferrer" title="Xem ảnh xác nhận">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/orders/confirmation-photos/${p.id}`} alt="Ảnh xác nhận" loading="lazy" className="h-9 w-9 rounded border border-gray-200/30 object-cover" />
            </a>
          ))}
        </div>
      )}
      {(info.state === "PENDING" || info.state === "OVERDUE") && (
        <>
          <div className={cn("flex items-center gap-1.5 text-xs font-medium", info.state === "OVERDUE" ? "text-alert" : "text-amber-400")}>
            {info.state === "OVERDUE" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Clock className="h-3.5 w-3.5 shrink-0" />}
            <span>{info.state === "OVERDUE" ? "Quá hạn — lỗi Admin" : `Chờ xác nhận — còn ${leftText(info.deadline!, now)}`}</span>
          </div>
          {canConfirm && (
            <button onClick={() => setOpen(true)} className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/20">
              Xác nhận đơn
            </button>
          )}
        </>
      )}
      {open && <ConfirmDialog order={order} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Chọn file hoặc dán (Ctrl+V) ảnh xác nhận của PKH/SX rồi bấm Xác nhận. Không cần điền gì thêm. */
function ConfirmDialog({ order, onClose }: { order: ConfirmOrder; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function add(list: File[]) {
    const imgs = list.filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFiles((cur) => [...cur, ...imgs].slice(0, MAX));
  }

  // Ctrl+V ở bất kỳ đâu trong hộp thoại đều dán được ảnh (vd ảnh cắt bằng Win+Shift+S).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []);
      if (f.length) {
        e.preventDefault();
        add(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("file", await compressImage(f), "xacnhan.jpg");
      const res = await fetch(`/api/orders/${order.id}/confirm`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không lưu được");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-gray-200/30 bg-navy-900 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Xác nhận đơn {order.orderCode}</p>
            <p className="text-xs text-muted-foreground">{order.customerName}</p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-muted2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-xs text-ink2">Đính kèm ảnh chụp xác nhận của PKH/SX (tin nhắn hoặc mail trả lời):</p>
        <div className="mt-2 rounded-xl border border-dashed border-amber-500/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {previews.map((u, i) => (
              <div key={u} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="Ảnh xác nhận" className="h-20 w-20 rounded-md border border-gray-200/30 object-cover" />
                <button
                  onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                  aria-label="Gỡ ảnh"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 p-0.5 text-white hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {files.length < MAX && (
              <button
                onClick={() => inputRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-gray-200/40 text-[11px] text-ink2 hover:bg-white/5"
              >
                <ImagePlus className="h-5 w-5" />
                Chọn file
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                add(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Hoặc nhấn Ctrl+V để dán ảnh (cắt bằng Win+Shift+S). Tối đa {MAX} ảnh.</p>
        </div>

        {error && <p className="mt-3 text-xs text-alert">{error}</p>}
        <button
          disabled={files.length === 0 || busy}
          onClick={submit}
          className="mt-4 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
        >
          {busy ? "Đang lưu..." : "Xác nhận đơn"}
        </button>
      </div>
    </div>
  );
}
