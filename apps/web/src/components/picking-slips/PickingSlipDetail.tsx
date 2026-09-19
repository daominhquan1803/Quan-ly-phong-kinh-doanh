"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { formatDateVN } from "@/lib/utils";

interface SlipItem {
  id: string;
  lineOrder: number;
  poCode: string;
  itemCode: string | null;
  itemName: string;
  customerItemCode: string | null;
  unit: string | null;
  poQuantitySnapshot: string | null;
  remainingQtySnapshot: string | null;
  qtyToPick: string;
  deliveryDate: string | null;
}
interface SlipDetail {
  id: string;
  slipNumber: string;
  slipDate: string;
  customerName: string;
  deliveryAddress: string | null;
  contactPhone: string | null;
  salesEmployeeNameSnapshot: string | null;
  salesEmployeePhoneSnapshot: string | null;
  note: string | null;
  createdBy: { name: string };
  items: SlipItem[];
}

const COMPANY_NAME = "CÔNG TY CỔ PHẦN GIẢI PHÁP ĐÓNG GÓI HOÀNG GIA";
const COMPANY_ADDRESS = "Số 44/215 Định Công Thượng, Định Công, Hoàng Mai, HN";
const COMPANY_EMAIL = "kinhdoanh@hoanggiaps.com";
const COMPANY_WEBSITE = "www.hoanggiaps.com";

function fmtQty(n: string | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(n));
}

export function PickingSlipDetail({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["picking-slip", id],
    queryFn: async () => {
      const res = await fetch(`/api/picking-slips/${id}`);
      if (!res.ok) throw new Error("Không tải được Phiếu soạn hàng");
      return res.json() as Promise<{ slip: SlipDetail }>;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  if (error || !data) return <p className="text-sm text-alert">Không tải được phiếu.</p>;
  const slip = data.slip;
  const d = new Date(slip.slipDate);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <Link href="/picking-slips" className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-amber-400 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Danh sách phiếu soạn hàng
        </Link>
        <a
          href={`/api/picking-slips/${id}/export`}
          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all"
        >
          <Download className="h-3.5 w-3.5 text-amber-400" /> Tải Excel
        </a>
      </div>

      <div className="glass-card border border-white/15 rounded-3xl p-8 shadow-[0_12px_40px_rgb(0,0,0,0.4)] backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/10 pb-6 mb-6">
          <div className="text-xs text-gray-400 space-y-1">
            <p className="font-bold text-white text-sm tracking-wide">{COMPANY_NAME}</p>
            <p>Địa chỉ: {COMPANY_ADDRESS}</p>
            <p>Email: <span className="text-gray-300 font-mono">{COMPANY_EMAIL}</span> • Web: <span className="text-gray-300 font-mono">{COMPANY_WEBSITE}</span></p>
          </div>
          <div className="text-right sm:text-right">
            <span className="inline-block font-mono text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
              {slip.slipNumber}
            </span>
            <p className="text-xs text-gray-400 mt-1.5">
              Phụ trách: <strong className="text-white font-medium">{slip.salesEmployeeNameSnapshot ?? "—"}</strong>
              {slip.salesEmployeePhoneSnapshot ? ` (${slip.salesEmployeePhoneSnapshot})` : ""}
            </p>
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">
            Phiếu Soạn Hàng
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Ngày {d.getDate()} tháng {d.getMonth() + 1} năm {d.getFullYear()}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-6">
          <div>
            <span className="text-gray-400">Khách hàng: </span>
            <strong className="text-white text-sm font-semibold">{slip.customerName}</strong>
          </div>
          {slip.contactPhone && (
            <div>
              <span className="text-gray-400">SĐT liên hệ: </span>
              <span className="font-mono text-gray-200">{slip.contactPhone}</span>
            </div>
          )}
          {slip.deliveryAddress && (
            <div className="sm:col-span-2">
              <span className="text-gray-400">Địa chỉ giao hàng: </span>
              <span className="text-gray-200">{slip.deliveryAddress}</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.04] text-gray-400 uppercase tracking-wider font-semibold border-b border-white/10">
              <tr>
                <th className="py-2.5 px-2 text-center">STT</th>
                <th className="py-2.5 px-2.5 text-left">Mã hàng</th>
                <th className="py-2.5 px-2.5 text-left">Tên hàng</th>
                <th className="py-2.5 px-2.5 text-left">Số PO</th>
                <th className="py-2.5 px-2.5 text-left">Mã Hàng/PO-KH</th>
                <th className="py-2.5 px-2 text-center">ĐVT</th>
                <th className="py-2.5 px-2.5 text-right">SL PO</th>
                <th className="py-2.5 px-2.5 text-right">SL Còn Lại</th>
                <th className="py-2.5 px-2.5 text-right">SL Cần Soạn</th>
                <th className="py-2.5 px-2.5 text-center">Ngày Giao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {slip.items.map((it, i) => (
                <tr key={it.id} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 px-2 text-center text-gray-500 font-mono">{i + 1}</td>
                  <td className="py-2.5 px-2.5 font-mono text-amber-400 font-medium">{it.itemCode ?? "—"}</td>
                  <td className="py-2.5 px-2.5 text-white font-medium">{it.itemName}</td>
                  <td className="py-2.5 px-2.5 whitespace-nowrap font-mono text-gray-300">{it.poCode}</td>
                  <td className="py-2.5 px-2.5 text-gray-400 font-mono">{it.customerItemCode ?? "—"}</td>
                  <td className="py-2.5 px-2 text-center text-gray-400">{it.unit ?? "—"}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-gray-300">{fmtQty(it.poQuantitySnapshot)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-gray-300">{fmtQty(it.remainingQtySnapshot)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono font-bold text-amber-400 text-sm">
                    {fmtQty(it.qtyToPick)}
                  </td>
                  <td className="py-2.5 px-2.5 whitespace-nowrap text-center text-gray-400">{formatDateVN(it.deliveryDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {slip.note && (
          <div className="mt-5 text-xs bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
            <p className="font-semibold text-amber-400 uppercase tracking-wider mb-1">LƯU Ý ĐẶC BIỆT:</p>
            <p className="text-gray-300 whitespace-pre-line">{slip.note}</p>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 mt-6 pt-4 border-t border-white/5">
          <span>Người lập phiếu: <strong className="text-gray-400">{slip.createdBy.name}</strong></span>
          <span className="italic">Hệ thống quản lý phòng kinh doanh Hoàng Gia CRM</span>
        </div>
      </div>
    </div>
  );
}
