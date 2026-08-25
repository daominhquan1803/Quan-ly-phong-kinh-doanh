"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";

export function CancelOrderButton({ orderId, isCancelled }: { orderId: string; isCancelled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetStatus(status: "CANCELLED" | "NEW") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Cập nhật thất bại");
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  if (isCancelled) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => handleSetStatus("NEW")}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-ink2 hover:bg-gray-50 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          {loading ? "Đang xử lý..." : "Khôi phục đơn hàng"}
        </button>
        {error && <p className="text-xs text-brandRed-600">{error}</p>}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink2">Xác nhận huỷ đơn này?</span>
          <button
            onClick={() => handleSetStatus("CANCELLED")}
            disabled={loading}
            className="rounded-md bg-brandRed-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brandRed-700 disabled:opacity-50"
          >
            {loading ? "Đang huỷ..." : "Huỷ đơn"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-ink2 hover:bg-gray-50"
          >
            Thôi
          </button>
        </div>
        {error && <p className="text-xs text-brandRed-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 rounded-md border border-brandRed-600 px-3 py-1.5 text-sm font-medium text-brandRed-600 hover:bg-brandRed-50"
    >
      <Ban className="h-4 w-4" />
      Huỷ đơn hàng
    </button>
  );
}
