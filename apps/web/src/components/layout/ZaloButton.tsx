"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

interface ZaloStatus {
  configured: boolean;
  linked: boolean;
  offTypes: string[];
  code: string | null;
  types: Record<string, string>;
}

export function ZaloButton() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<ZaloStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/zalo");
      if (res.ok) setS(await res.json());
    } catch {
      /* mạng lỗi: giữ trạng thái cũ */
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Đang chờ nhân viên nhắn mã cho bot -> hỏi lại 3 giây/lần để tự chuyển sang "Đã liên kết".
  const waiting = open && !!s?.code && !s.linked;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [waiting, load]);

  async function act(action: "code" | "test" | "unlink") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/zalo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(json.error ?? "Có lỗi xảy ra");
      else if (action === "test") setMsg("Đã gửi tin thử, kiểm tra Zalo của bạn");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(type: string) {
    if (!s) return;
    const off = s.offTypes.includes(type) ? s.offTypes.filter((t) => t !== type) : [...s.offTypes, type];
    setS({ ...s, offTypes: off });
    await fetch("/api/zalo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offTypes: off }),
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink"
        aria-label="Thông báo Zalo"
      >
        <MessageCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Zalo</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-lg border border-gray-200 bg-card p-4 shadow-lg z-20 space-y-3">
            <p className="text-sm font-medium text-ink">Nhận thông báo qua Zalo</p>
            {msg && <p className="text-xs text-alert">{msg}</p>}
            {!s ? (
              <p className="text-xs text-muted-foreground">Đang tải...</p>
            ) : !s.configured ? (
              <p className="text-xs text-muted-foreground">Quản trị viên chưa bật kênh Zalo cho hệ thống.</p>
            ) : s.linked ? (
              <>
                <p className="text-xs text-success-600">Đã liên kết Zalo.</p>
                <div className="space-y-1.5">
                  {Object.entries(s.types).map(([type, label]) => (
                    <label key={type} className="flex items-center gap-2 text-xs text-ink">
                      <input type="checkbox" checked={!s.offTypes.includes(type)} onChange={() => toggle(type)} />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => act("test")}
                    disabled={busy}
                    className="flex-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50"
                  >
                    Gửi thử
                  </button>
                  <button
                    onClick={() => act("unlink")}
                    disabled={busy}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-muted-foreground hover:bg-gray-50"
                  >
                    Huỷ liên kết
                  </button>
                </div>
              </>
            ) : s.code ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Mở Zalo, nhắn mã dưới đây cho bot của công ty (mã có hiệu lực 10 phút):
                </p>
                <p className="text-center font-mono text-2xl font-bold tracking-widest text-amber-400">{s.code}</p>
                <p className="text-xs text-muted-foreground">Bot trả lời &quot;Đã liên kết&quot; là xong, cửa sổ này tự cập nhật.</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Chưa liên kết. Bấm tạo mã, rồi nhắn mã đó cho bot Zalo của công ty.
                </p>
                <button
                  onClick={() => act("code")}
                  disabled={busy}
                  className="w-full rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50"
                >
                  Tạo mã liên kết
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
