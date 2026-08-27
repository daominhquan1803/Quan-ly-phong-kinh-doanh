import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { formatDateVN } from "@/lib/utils";

export const dynamic = "force-dynamic";

const COMPANY_NAME = "CÔNG TY CỔ PHẦN GIẢI PHÁP ĐÓNG GÓI HOÀNG GIA";
const COMPANY_ADDRESS = "Số 44/215 Định Công Thượng, Định Công, Hoàng Mai, HN";
const COMPANY_EMAIL = "kinhdoanh@hoanggiaps.com";
const COMPANY_WEBSITE = "www.hoanggiaps.com";

function fmtQty(n: unknown): string {
  if (n == null) return "";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(n));
}

/** Xuất Phiếu soạn hàng ra file Excel — bố cục dựa theo file mẫu anh Quân gửi (đơn giản hoá, giữ
 * đủ thông tin cần thiết cho kho soạn hàng: thông tin công ty/khách hàng + bảng dòng hàng). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const slip = await prisma.pickingSlip.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { lineOrder: "asc" } } },
    });
    if (!slip) return NextResponse.json({ error: "Không tìm thấy Phiếu soạn hàng" }, { status: 404 });

    const d = slip.slipDate;
    const rows: (string | number)[][] = [
      [],
      [COMPANY_NAME],
      [`Địa chỉ: ${COMPANY_ADDRESS}`],
      [`Email: ${COMPANY_EMAIL}`],
      [`Website: ${COMPANY_WEBSITE}`],
      [],
      [`Phụ trách đơn hàng: ${slip.salesEmployeeNameSnapshot ?? "—"}${slip.salesEmployeePhoneSnapshot ? "_" + slip.salesEmployeePhoneSnapshot : ""}`],
      ["PHIẾU SOẠN HÀNG"],
      [],
      [`Số phiếu: ${slip.slipNumber}`, "", `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`],
      [],
      ["Khách hàng:", "", slip.customerName],
      ["Địa chỉ giao hàng:", "", slip.deliveryAddress ?? ""],
      ["SĐT liên hệ:", "", slip.contactPhone ?? ""],
      [],
      [
        "STT",
        "Mã hàng",
        "Tên hàng",
        "Số PO",
        "Mã Hàng/ Số PO-KH",
        "ĐVT",
        "SL PO",
        "SL còn lại chưa giao",
        "SL cần soạn",
        "Ngày cần giao",
      ],
      ...slip.items.map((it, i) => [
        i + 1,
        it.itemCode ?? "",
        it.itemName,
        it.poCode,
        it.customerItemCode ?? "",
        it.unit ?? "",
        fmtQty(it.poQuantitySnapshot),
        fmtQty(it.remainingQtySnapshot),
        fmtQty(it.qtyToPick),
        formatDateVN(it.deliveryDate),
      ]),
      [],
      ["LƯU Ý:"],
      [
        "- Khi soạn hàng lưu ý đúng mã, đúng nội dung tem nhãn.\n- Đóng gói theo quy cách của khách hàng.\n- Chuẩn bị đầy đủ giấy tờ đi kèm.",
      ],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 40 },
      { wch: 16 },
      { wch: 18 },
      { wch: 8 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
    ];
    sheet["!merges"] = [
      { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
      { s: { r: 7, c: 0 }, e: { r: 7, c: 9 } },
      { s: { r: 11, c: 2 }, e: { r: 11, c: 9 } },
      { s: { r: 12, c: 2 }, e: { r: 12, c: 9 } },
      { s: { r: 13, c: 2 }, e: { r: 13, c: 9 } },
      { s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: 9 } },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Phiếu soạn hàng");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${slip.slipNumber}.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("picking-slips/[id]/export GET error", err);
    return NextResponse.json({ error: "Không xuất được file Excel" }, { status: 500 });
  }
}
