import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@hoanggia/db";
import { auth } from "@/lib/auth";
import { OrderStatusBadge } from "@/components/orders/StatusBadge";
import { CancelOrderButton } from "@/components/orders/CancelOrderButton";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { isOrderOverdue } from "@/lib/order-status";

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      salesEmployee: { select: { id: true, name: true } },
      shipmentSlips: { select: { id: true, slipNumber: true, slipDate: true, status: true } },
      items: { orderBy: { lineOrder: "asc" } },
    },
  });

  if (!order) notFound();
  if (session.user.role !== "ADMIN" && order.salesEmployeeId !== session.user.id) {
    redirect("/orders");
  }

  const overdue = isOrderOverdue(order);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
            <Link href="/orders" className="hover:text-amber-400 transition-colors">
              ← Danh sách đơn hàng
            </Link>
            <span>/</span>
            <span className="font-mono text-amber-400">{order.orderCode}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            Đơn Hàng <span className="font-mono text-amber-400">{order.orderCode}</span>
          </h1>
          <p className="text-sm text-gray-300 mt-0.5 font-medium">{order.customerName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OrderStatusBadge status={order.status} overdue={overdue} />
          {session.user.role === "ADMIN" && (
            <CancelOrderButton orderId={order.id} isCancelled={order.status === "CANCELLED"} />
          )}
        </div>
      </div>
      {session.user.role === "ADMIN" && order.source === "AMIS_API" && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 text-xs text-amber-300/90 flex items-center gap-2">
          <span>ℹ️ Đơn này đồng bộ từ AMIS — nếu AMIS vẫn ghi nhận đơn đang hoạt động, lần đồng bộ tiếp theo có thể tự khôi phục lại trạng thái theo AMIS.</span>
        </div>
      )}

      <div className="glass-card border border-white/10 rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-sm shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        <div>
          <p className="text-xs uppercase font-semibold tracking-wider text-gray-400 mb-1">Nhân viên phụ trách</p>
          <p className="font-medium text-white">{order.salesEmployee?.name ?? order.salesEmployeeNameRaw ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase font-semibold tracking-wider text-gray-400 mb-1">PO / Mã hàng KH</p>
          <p className="font-mono font-medium text-amber-300">{order.poCode ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase font-semibold tracking-wider text-gray-400 mb-1">Ngày đặt hàng</p>
          <p className="font-medium text-white">{formatDateVN(order.orderDate)}</p>
        </div>
        <div>
          <p className="text-xs uppercase font-semibold tracking-wider text-gray-400 mb-1">Ngày giao dự kiến</p>
          <p className={overdue ? "font-semibold text-rose-400" : "font-medium text-white"}>
            {formatDateVN(order.expectedDeliveryDate)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase font-semibold tracking-wider text-gray-400 mb-1">Ngày giao thực tế</p>
          <p className="font-medium text-white">
            {order.actualDeliveryDate ? formatDateVN(order.actualDeliveryDate) : "Chưa giao"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase font-semibold tracking-wider text-gray-400 mb-1">Giá trị đơn hàng</p>
          <p className="font-mono font-bold text-amber-400 text-base">
            {formatCurrencyVND(order.totalValue.toString())}
          </p>
        </div>
      </div>

      <div className="glass-card border border-white/10 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white tracking-wide">Chi Tiết Mã Hàng Trong Đơn</h2>
          <span className="text-xs font-mono text-gray-400 bg-white/[0.05] px-2 py-0.5 rounded border border-white/10">
            {order.items.length} mặt hàng
          </span>
        </div>
        {order.items.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-2">Chưa có dữ liệu chi tiết mã hàng cho đơn này.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/10 text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="text-left py-3 px-3">Mã hàng</th>
                  <th className="text-left py-3 px-3">Tên hàng</th>
                  <th className="text-left py-3 px-3">ĐVT</th>
                  <th className="text-right py-3 px-3">Số lượng</th>
                  <th className="text-right py-3 px-3">Đơn giá</th>
                  <th className="text-right py-3 px-3">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {order.items.map((it) => (
                  <tr key={it.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-amber-400">{it.itemCode ?? "—"}</td>
                    <td className="py-2.5 px-3 text-white font-medium">{it.itemName}</td>
                    <td className="py-2.5 px-3 text-gray-400">{it.unit ?? "—"}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-white">{it.quantity.toString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-gray-300">{formatCurrencyVND(it.unitPrice.toString())}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">{formatCurrencyVND(it.totalPrice.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card border border-white/10 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        <h2 className="text-base font-semibold text-white tracking-wide mb-3">Phiếu Đi Hàng Liên Quan</h2>
        {order.shipmentSlips.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Chưa có phiếu đi hàng nào liên kết với đơn này.</p>
        ) : (
          <ul className="divide-y divide-white/5 text-xs">
            {order.shipmentSlips.map((s) => (
              <li key={s.id} className="py-2.5 flex items-center justify-between hover:bg-white/[0.02] px-2 rounded-lg transition-colors">
                <Link href={`/shipment-slips/${s.id}`} className="font-mono font-medium text-amber-400 hover:text-amber-300 flex items-center gap-2">
                  <span>📄 {s.slipNumber}</span>
                </Link>
                <span className="text-gray-400">{formatDateVN(s.slipDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
