import { z } from "zod";
import { Prisma } from "@hoanggia/db";

/**
 * Biên bản hàng lỗi (anh Quân chốt 17/10/2026): số biên bản nhập tay theo số của công ty; chọn khách + phiếu đi hàng (hoặc
 * ngày giao) + mặt hàng + SL lỗi; thông tin lỗi; người chịu trách nhiệm (NVKD và/hoặc Admin kinh doanh — tính vào KPI tháng
 * của từng người) hoặc bộ phận khác; ảnh lỗi. Giải quyết xong thì đóng biên bản, ghi có sửa hoá đơn bán hàng không, sửa hoá
 * đơn nào, sửa thế nào.
 */
export { DEFECT_OTHER_PARTIES } from "./defect-report-shared";

const qty = z.coerce.number().positive("Số lượng lỗi phải lớn hơn 0").max(1e9);

export const defectItemSchema = z.object({
  slipItemId: z.string().trim().min(1).optional().nullable(),
  itemCode: z.string().trim().max(100).optional().nullable(),
  itemName: z.string().trim().min(1, "Thiếu tên mặt hàng").max(500),
  unit: z.string().trim().max(50).optional().nullable(),
  deliveredQty: z.coerce.number().min(0).max(1e12).optional().nullable(),
  defectQty: qty,
});

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

export const defectBodySchema = z
  .object({
    reportNumber: z.string().trim().min(1, "Thiếu số biên bản").max(100),
    reportDate: ymd,
    customerCode: z.string().trim().max(100).optional().nullable(),
    customerName: z.string().trim().min(1, "Thiếu khách hàng").max(500),
    shipmentSlipId: z.string().trim().min(1).optional().nullable(),
    deliveryDate: ymd.optional().nullable(),
    description: z.string().trim().min(1, "Thiếu thông tin lỗi").max(5000),
    items: z.array(defectItemSchema).min(1, "Chọn ít nhất 1 mặt hàng bị lỗi").max(100),
    responsibleUserIds: z.array(z.string().min(1)).max(20).default([]),
    otherResponsible: z.string().trim().max(200).optional().nullable(),
    /** Thời điểm nhận khiếu nại "YYYY-MM-DDTHH:mm" giờ VN — tính hạn phản hồi 24h của Admin. Trống = lúc lập biên bản. */
    receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Thời điểm nhận không hợp lệ").optional().nullable(),
  })
  .refine((b) => b.responsibleUserIds.length > 0 || !!b.otherResponsible, {
    message: "Chọn người hoặc bộ phận chịu trách nhiệm",
    path: ["responsibleUserIds"],
  })
  .refine((b) => !!b.shipmentSlipId || !!b.deliveryDate, { message: "Chọn phiếu đi hàng hoặc nhập ngày giao hàng", path: ["deliveryDate"] });

export type DefectBody = z.infer<typeof defectBodySchema>;

/** Loại xử lý khi đóng: đổi hàng theo biên bản / huỷ tại kho khách + trừ công nợ (kế toán điều chỉnh ở AMIS) / khác. */
export const DEFECT_RESOLUTION_TYPES = ["REPLACED", "DESTROYED_DEDUCT_DEBT", "OTHER"] as const;

export const closeSchema = z
  .object({
    action: z.literal("close"),
    resolution: z.string().trim().min(1, "Ghi cách đã xử lý").max(5000),
    invoiceAdjusted: z.boolean({ required_error: "Chọn có sửa hoá đơn bán hàng hay không" }),
    adjustedInvoiceNumbers: z.string().trim().max(500).optional().nullable(),
    invoiceAdjustNote: z.string().trim().max(5000).optional().nullable(),
    resolutionType: z.enum(DEFECT_RESOLUTION_TYPES).default("OTHER"),
    deductAmount: z.coerce.number().positive("Số tiền trừ phải lớn hơn 0").max(1e13).optional().nullable(),
  })
  .refine((b) => !b.invoiceAdjusted || (!!b.adjustedInvoiceNumbers && !!b.invoiceAdjustNote), {
    message: "Có sửa hoá đơn thì ghi số hoá đơn và sửa như thế nào",
    path: ["adjustedInvoiceNumbers"],
  })
  .refine((b) => b.resolutionType !== "DESTROYED_DEDUCT_DEBT" || (!!b.deductAmount && b.invoiceAdjusted && !!b.adjustedInvoiceNumbers), {
    message: "Huỷ tại kho khách, trừ công nợ: nhập số tiền trừ và số hoá đơn điều chỉnh",
    path: ["deductAmount"],
  });

/** Ngày "YYYY-MM-DD" theo giờ VN -> Date 0h VN. */
export const vnDate = (s: string) => new Date(`${s}T00:00:00+07:00`);
/** "YYYY-MM-DDTHH:mm" giờ VN -> Date. */
export const vnDateTime = (s: string | null | undefined) => (s ? new Date(`${s}:00+07:00`) : null);

/** Phạm vi xem: ADMIN (mọi mức) thấy tất cả; NVKD chỉ biên bản mình chịu trách nhiệm. */
export function defectScope(user: { id: string; role: string }): Prisma.DefectReportWhereInput {
  return user.role === "ADMIN" ? {} : { responsibles: { some: { userId: user.id } } };
}

export const defectInclude = {
  items: { orderBy: { id: "asc" as const } },
  responsibles: { include: { user: { select: { id: true, name: true, role: true, accessLevel: true } } } },
  photos: { select: { id: true }, orderBy: { createdAt: "asc" as const } },
  shipmentSlip: { select: { id: true, slipNumber: true, slipDate: true } },
  createdBy: { select: { name: true } },
  closedBy: { select: { name: true } },
  replacements: {
    select: { id: true, defectReportItemId: true, quantity: true, shipmentSlipItem: { select: { shipmentSlip: { select: { id: true, slipNumber: true, slipDate: true } } } } },
    orderBy: { confirmedAt: "asc" as const },
  },
} satisfies Prisma.DefectReportInclude;
