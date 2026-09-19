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
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
            <Link href="/shipment-slips" className="hover:text-amber-400 transition-colors">
              ← Danh sách phiếu xuất kho
            </Link>
            <span>/</span>
            <span className="font-mono text-amber-400">{slip.slipNumber}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            Phiếu Xuất Kho <span className="font-mono text-amber-400">{slip.slipNumber}</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Lập bởi <strong className="text-white font-medium">{slip.createdBy.name}</strong> • Ngày xuất: <span className="text-gray-300 font-mono">{formatDateVN(slip.slipDate)}</span>
          </p>
        </div>
        {slip.order && (
          <Link
            href={`/orders/${slip.order.id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)]"
          >
            <span>📦 Đơn hàng {slip.order.orderCode}</span>
          </Link>
        )}
      </div>

      <div className={cn("grid grid-cols-1 gap-6", slip.imagePath && "lg:grid-cols-2")}>
        <div className="space-y-5">
          <div className="glass-card border border-white/10 rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <Info label="Người nhận hàng" value={slip.receiverName} />
            <Info label="Khách hàng" value={slip.customerName} />
            <Info label="Địa chỉ giao hàng" value={slip.deliveryAddress} full />
            <Info label="Diễn giải xuất hàng" value={slip.description} full />
            <Info label="Hình thức thanh toán" value={slip.paymentMethod} />
            <Info label="Người lập phiếu" value={slip.preparedBy} />
          </div>

          <div className="glass-card border border-white/10 rounded-2xl p-6 overflow-x-auto shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">
              Chi Tiết Hàng Hóa Xuất Kho
            </h2>
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/10 text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="text-left py-2.5 px-2.5">Mã hàng</th>
                  <th className="text-left py-2.5 px-2.5">Tên hàng</th>
                  <th className="text-left py-2.5 px-2.5">Kho</th>
                  <th className="text-center py-2.5 px-2.5">ĐVT</th>
                  <th className="text-right py-2.5 px-2.5">SL YC</th>
                  <th className="text-right py-2.5 px-2.5">SL Thực Xuất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {slip.items.map((it) => (
                  <tr key={it.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-2.5 font-mono text-amber-400 font-medium">{it.itemCode ?? "—"}</td>
                    <td className="py-2.5 px-2.5 text-white font-medium">{it.itemName}</td>
                    <td className="py-2.5 px-2.5 text-gray-400">{it.warehouse ?? "—"}</td>
                    <td className="py-2.5 px-2.5 text-center text-gray-400">{it.unit ?? "—"}</td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-gray-300">{it.qtyRequested?.toString() ?? "—"}</td>
                    <td className="py-2.5 px-2.5 text-right font-mono font-bold text-emerald-400">{it.qtyActual?.toString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {slip.imagePath && (
          <div className="glass-card border border-white/10 rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.3)] flex flex-col justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slip.imageThumbPath ?? slip.imagePath} alt={slip.slipNumber} className="w-full rounded-xl object-contain max-h-[500px]" />
            <a
              href={slip.imagePath}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-center text-xs font-semibold text-amber-400 hover:text-amber-300 mt-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
            >
              {slip.imagePath.toLowerCase().endsWith(".pdf") ? "📄 Xem file PDF chứng từ gốc" : "🔍 Xem ảnh chứng từ kích thước gốc"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={full ? "col-span-1 sm:col-span-2" : undefined}>
      <p className="text-gray-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">{label}</p>
      <p className="font-medium text-white text-xs">{value ?? "—"}</p>
    </div>
  );
}
