"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Edit2, X } from "lucide-react";
import { toDateInputValueVN } from "@/lib/utils";

type EditOrderDialogProps = {
  order: {
    id: string;
    customerName: string;
    customerCode: string | null;
    poCode: string | null;
    totalValue: number;
    orderDate: Date | null;
    expectedDeliveryDate: Date | null;
  };
};

export function EditOrderDialog({ order }: EditOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const data = {
        customerName: formData.get("customerName") as string,
        customerCode: (formData.get("customerCode") as string) || null,
        poCode: (formData.get("poCode") as string) || null,
        totalValue: Number(formData.get("totalValue") || 0),
        orderDate: (formData.get("orderDate") as string) || null,
        expectedDeliveryDate: (formData.get("expectedDeliveryDate") as string) || null,
      };

      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Lỗi khi cập nhật");
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 border border-white/20 bg-transparent hover:bg-white/5 text-white h-9 px-4 py-2">
          <Edit2 className="h-4 w-4" />
          Sửa thông tin
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-white/10 bg-[#0A1424] p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-2xl text-white">
          <div className="flex flex-col space-y-1.5 text-center sm:text-left">
            <Dialog.Title className="text-lg font-semibold leading-none tracking-tight">
              Sửa thông tin đơn hàng thủ công
            </Dialog.Title>
          </div>
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="customerName" className="text-sm font-medium leading-none">Tên khách hàng (*)</label>
              <input id="customerName" name="customerName" defaultValue={order.customerName} required className="input bg-white/5 border-white/10 text-white focus:bg-white/5" />
            </div>

            <div className="space-y-2">
              <label htmlFor="customerCode" className="text-sm font-medium leading-none">Mã khách hàng</label>
              <input id="customerCode" name="customerCode" defaultValue={order.customerCode || ""} className="input bg-white/5 border-white/10 text-white focus:bg-white/5" />
            </div>

            <div className="space-y-2">
              <label htmlFor="poCode" className="text-sm font-medium leading-none">PO Code</label>
              <input id="poCode" name="poCode" defaultValue={order.poCode || ""} className="input bg-white/5 border-white/10 text-white focus:bg-white/5" />
            </div>

            <div className="space-y-2">
              <label htmlFor="totalValue" className="text-sm font-medium leading-none">Giá trị đơn hàng (VNĐ)</label>
              <input id="totalValue" name="totalValue" type="number" min={0} step="any" defaultValue={order.totalValue} className="input bg-white/5 border-white/10 text-white focus:bg-white/5" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="orderDate" className="text-sm font-medium leading-none">Ngày đặt hàng</label>
                <input id="orderDate" name="orderDate" type="date" defaultValue={toDateInputValueVN(order.orderDate)} className="input bg-white/5 border-white/10 text-white focus:bg-white/5 [&::-webkit-calendar-picker-indicator]:invert" />
              </div>

              <div className="space-y-2">
                <label htmlFor="expectedDeliveryDate" className="text-sm font-medium leading-none">Ngày giao ĐK</label>
                <input id="expectedDeliveryDate" name="expectedDeliveryDate" type="date" defaultValue={toDateInputValueVN(order.expectedDeliveryDate)} className="input bg-white/5 border-white/10 text-white focus:bg-white/5 [&::-webkit-calendar-picker-indicator]:invert" />
              </div>
            </div>

            {error && <p className="text-xs text-alert">{error}</p>}

            <div className="pt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className="inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors hover:bg-white/10 h-10 px-4 py-2" disabled={loading}>
                  Huỷ
                </button>
              </Dialog.Close>
              <button type="submit" disabled={loading} className="inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors bg-amber-500 text-slate-900 hover:bg-amber-600 h-10 px-4 py-2 disabled:opacity-50">
                {loading ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
