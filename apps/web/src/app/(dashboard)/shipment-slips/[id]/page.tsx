import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@hoanggia/db";
import { auth } from "@/lib/auth";
import { cn, formatDateVN } from "@/lib/utils";

export default async function ShipmentSlipDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const slip = await prisma.shipmentSlip.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: { lineOrder: "asc" } },
      order: { select: { id: true, orderCode: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (!slip) notFound();
  if (session.user.role !== "ADMIN" && slip.createdById !== session.user.id) {
    redirect("/shipment-slips");
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Phiếu {slip.slipNumber}</h1>
          <p className="text-sm text-gray-500">
            Lập bởi {slip.createdBy.name} · {formatDateVN(slip.slipDate)}
          </p>
        </div>
        {slip.order && (
          <Link
            href={`/orders/${slip.order.id}`}
            className="status-badge status-badge--producing"
          >
            Đơn hàng {slip.order.orderCode}
          </Link>
        )}
      </div>

      <div className={cn("grid grid-cols-1 gap-6", slip.imagePath && "lg:grid-cols-2")}>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 grid grid-cols-2 gap-4 text-sm">
            <Info label="Người nhận hàng" value={slip.receiverName} />
            <Info label="Khách hàng" value={slip.customerName} />
            <Info label="Địa chỉ giao hàng" value={slip.deliveryAddress} full />
            <Info label="Diễn giải" value={slip.description} full />
            <Info label="Hình thức thanh toán" value={slip.paymentMethod} />
            <Info label="Người lập phiếu" value={slip.preparedBy} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 overflow-x-auto">
            <h2 className="font-medium text-gray-900 mb-3">Chi tiết hàng hoá</h2>
            <table className="min-w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left px-2 py-1">Mã hàng</th>
                  <th className="text-left px-2 py-1">Tên hàng</th>
                  <th className="text-left px-2 py-1">Kho</th>
                  <th className="text-left px-2 py-1">ĐVT</th>
                  <th className="text-right px-2 py-1">SL YC</th>
                  <th className="text-right px-2 py-1">SL Thực xuất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {slip.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-2 py-1.5">{it.itemCode ?? "—"}</td>
                    <td className="px-2 py-1.5">{it.itemName}</td>
                    <td className="px-2 py-1.5">{it.warehouse ?? "—"}</td>
                    <td className="px-2 py-1.5">{it.unit ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{it.qtyRequested?.toString() ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{it.qtyActual?.toString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {slip.imagePath && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slip.imageThumbPath ?? slip.imagePath} alt={slip.slipNumber} className="w-full rounded-md" />
            <a
              href={slip.imagePath}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-navy-900 mt-2 hover:underline"
            >
              {slip.imagePath.toLowerCase().endsWith(".pdf") ? "Xem file PDF gốc" : "Xem ảnh gốc kích thước đầy đủ"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <p className="text-gray-500">{label}</p>
      <p className="font-medium text-gray-900">{value ?? "—"}</p>
    </div>
  );
}
