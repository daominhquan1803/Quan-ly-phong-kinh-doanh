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
  if (error || !data) return <p className="text-sm text-brandRed-600">Không tải được phiếu.</p>;
  const slip = data.slip;
  const d = new Date(slip.slipDate);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/picking-slips" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Danh sách phiếu
        </Link>
        <a
          href={`/api/picking-slips/${id}/export`}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" /> Tải Excel
        </a>
      </div>

      <div className="rounded-lg border border-gray-200 bg-card p-8">
        <div className="text-sm text-ink2 space-y-0.5 mb-4">
          <p className="font-semibold text-ink text-base">{COMPANY_NAME}</p>
          <p>Địa chỉ: {COMPANY_ADDRESS}</p>
          <p>Email: {COMPANY_EMAIL}</p>
          <p>Website: {COMPANY_WEBSITE}</p>
        </div>
        <p className="text-sm text-ink2 mb-4">
          Phụ trách đơn hàng: {slip.salesEmployeeNameSnapshot ?? "—"}
          {slip.salesEmployeePhoneSnapshot ? `_${slip.salesEmployeePhoneSnapshot}` : ""}
        </p>

        <h1 className="text-center text-lg font-bold text-ink mb-4">PHIẾU SOẠN HÀNG</h1>
        <div className="flex items-center justify-between text-sm text-ink2 mb-4">
          <span>Số phiếu: {slip.slipNumber}</span>
          <span>
            Ngày {d.getDate()} tháng {d.getMonth() + 1} năm {d.getFullYear()}
          </span>
        </div>

        <div className="text-sm space-y-1 mb-5">
          <p>
            <span className="text-muted-foreground">Khách hàng: </span>
            <span className="font-medium text-ink">{slip.customerName}</span>
          </p>
          {slip.deliveryAddress && (
            <p>
              <span className="text-muted-foreground">Địa chỉ giao hàng: </span>
              <span className="text-ink2">{slip.deliveryAddress}</span>
            </p>
          )}
          {slip.contactPhone && (
            <p>
              <span className="text-muted-foreground">SĐT liên hệ: </span>
              <span className="text-ink2">{slip.contactPhone}</span>
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200">
            <thead>
              <tr className="bg-gray-50 text-xs text-muted-foreground">
                <th className="border border-gray-200 px-2 py-1.5">STT</th>
                <th className="border border-gray-200 px-2 py-1.5">Mã hàng</th>
                <th className="border border-gray-200 px-2 py-1.5">Tên hàng</th>
                <th className="border border-gray-200 px-2 py-1.5">Số PO</th>
                <th className="border border-gray-200 px-2 py-1.5">Mã Hàng/Số PO-KH</th>
                <th className="border border-gray-200 px-2 py-1.5">ĐVT</th>
                <th className="border border-gray-200 px-2 py-1.5">SL PO</th>
                <th className="border border-gray-200 px-2 py-1.5">SL còn lại chưa giao</th>
                <th className="border border-gray-200 px-2 py-1.5">SL cần soạn</th>
                <th className="border border-gray-200 px-2 py-1.5">Ngày cần giao</th>
              </tr>
            </thead>
            <tbody>
              {slip.items.map((it, i) => (
                <tr key={it.id}>
                  <td className="border border-gray-200 px-2 py-1.5 text-center">{i + 1}</td>
                  <td className="border border-gray-200 px-2 py-1.5">{it.itemCode ?? "—"}</td>
                  <td className="border border-gray-200 px-2 py-1.5">{it.itemName}</td>
                  <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">{it.poCode}</td>
                  <td className="border border-gray-200 px-2 py-1.5">{it.customerItemCode ?? "—"}</td>
                  <td className="border border-gray-200 px-2 py-1.5">{it.unit ?? "—"}</td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right font-mono">{fmtQty(it.poQuantitySnapshot)}</td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right font-mono">{fmtQty(it.remainingQtySnapshot)}</td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right font-mono font-semibold text-amber-500">
                    {fmtQty(it.qtyToPick)}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">{formatDateVN(it.deliveryDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {slip.note && (
          <div className="mt-5 text-sm">
            <p className="font-semibold text-ink mb-1">LƯU Ý:</p>
            <p className="text-ink2 whitespace-pre-line">{slip.note}</p>
          </div>
        )}

        <p className="text-xs text-muted2 mt-6">Người lập phiếu: {slip.createdBy.name}</p>
      </div>
    </div>
  );
}
