import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@hoanggia/db";
import { auth } from "@/lib/auth";
import { OrderStatusBadge } from "@/components/orders/StatusBadge";
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
          <h1 className="text-xl font-semibold text-gray-900">Đơn hàng {order.orderCode}</h1>
          <p className="text-sm text-gray-500">{order.customerName}</p>
        </div>
        <OrderStatusBadge status={order.status} overdue={overdue} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Nhân viên kinh doanh</p>
          <p className="font-medium text-gray-900">{order.salesEmployee?.name ?? order.salesEmployeeNameRaw ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">PO / Mã hàng KH</p>
          <p className="font-medium text-gray-900">{order.poCode ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Ngày đặt hàng</p>
          <p className="font-medium text-gray-900">{formatDateVN(order.orderDate)}</p>
        </div>
        <div>
          <p className="text-gray-500">Ngày giao dự kiến</p>
          <p className={overdue ? "font-medium text-brandRed-600" : "font-medium text-gray-900"}>
            {formatDateVN(order.expectedDeliveryDate)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Giá trị đơn hàng</p>
          <p className="font-medium text-gray-900">{formatCurrencyVND(order.totalValue.toString())}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="font-medium text-gray-900 mb-3">Phiếu đi hàng liên quan</h2>
        {order.shipmentSlips.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có phiếu đi hàng nào liên kết với đơn này.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {order.shipmentSlips.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between">
                <Link href={`/shipment-slips/${s.id}`} className="font-medium text-navy-900">
                  {s.slipNumber}
                </Link>
                <span className="text-gray-500">{formatDateVN(s.slipDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
