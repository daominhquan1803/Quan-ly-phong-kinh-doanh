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
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Đơn hàng {order.orderCode}</h1>
          <p className="text-sm text-muted-foreground">{order.customerName}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OrderStatusBadge status={order.status} overdue={overdue} />
          {session.user.role === "ADMIN" && (
            <CancelOrderButton orderId={order.id} isCancelled={order.status === "CANCELLED"} />
          )}
        </div>
      </div>
      {session.user.role === "ADMIN" && order.source === "AMIS_API" && (
        <p className="text-xs text-muted-foreground -mt-4">
          Đơn này đồng bộ từ AMIS — nếu AMIS vẫn ghi nhận đơn đang hoạt động, lần đồng bộ tiếp theo có thể tự khôi
          phục lại trạng thái theo AMIS.
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Nhân viên kinh doanh</p>
          <p className="font-medium text-ink">{order.salesEmployee?.name ?? order.salesEmployeeNameRaw ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">PO / Mã hàng KH</p>
          <p className="font-medium text-ink">{order.poCode ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Ngày đặt hàng</p>
          <p className="font-medium text-ink">{formatDateVN(order.orderDate)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Ngày giao dự kiến</p>
          <p className={overdue ? "font-medium text-brandRed-600" : "font-medium text-ink"}>
            {formatDateVN(order.expectedDeliveryDate)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Ngày giao thực tế</p>
          <p className="font-medium text-ink">
            {order.actualDeliveryDate ? formatDateVN(order.actualDeliveryDate) : "Chưa giao"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Giá trị đơn hàng</p>
          <p className="font-medium text-ink">{formatCurrencyVND(order.totalValue.toString())}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-card p-5 overflow-x-auto">
        <h2 className="font-medium text-ink mb-3">Chi tiết mã hàng</h2>
        {order.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu chi tiết mã hàng cho đơn này.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-2 py-1.5">Mã hàng</th>
                <th className="text-left font-medium px-2 py-1.5">Tên hàng</th>
                <th className="text-left font-medium px-2 py-1.5">ĐVT</th>
                <th className="text-right font-medium px-2 py-1.5">Số lượng</th>
                <th className="text-right font-medium px-2 py-1.5">Đơn giá</th>
                <th className="text-right font-medium px-2 py-1.5">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-2 py-1.5 font-medium text-ink">{it.itemCode ?? "—"}</td>
                  <td className="px-2 py-1.5">{it.itemName}</td>
                  <td className="px-2 py-1.5">{it.unit ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{it.quantity.toString()}</td>
                  <td className="px-2 py-1.5 text-right">{formatCurrencyVND(it.unitPrice.toString())}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{formatCurrencyVND(it.totalPrice.toString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-card p-5">
        <h2 className="font-medium text-ink mb-3">Phiếu đi hàng liên quan</h2>
        {order.shipmentSlips.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có phiếu đi hàng nào liên kết với đơn này.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {order.shipmentSlips.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between">
                <Link href={`/shipment-slips/${s.id}`} className="font-medium text-ink">
                  {s.slipNumber}
                </Link>
                <span className="text-muted-foreground">{formatDateVN(s.slipDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
