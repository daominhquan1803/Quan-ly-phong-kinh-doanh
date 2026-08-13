import { z } from "zod";

export const shipmentSlipItemSchema = z.object({
  itemCode: z.string().trim().optional().nullable(),
  itemName: z.string().trim().min(1, "Thiếu tên hàng"),
  warehouse: z.string().trim().optional().nullable(),
  poSaleNumber: z.string().trim().optional().nullable(),
  unit: z.string().trim().optional().nullable(),
  qtyRequested: z.number().nonnegative().optional().nullable(),
  qtyActual: z.number().nonnegative().optional().nullable(),
  poCustomerItemCode: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export const createShipmentSlipSchema = z.object({
  slipNumber: z.string().trim().min(1, "Thiếu số phiếu"),
  slipDate: z.string().datetime().optional().nullable().or(z.literal("").transform(() => null)),
  receiverName: z.string().trim().optional().nullable(),
  customerName: z.string().trim().optional().nullable(),
  deliveryAddress: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  paymentMethod: z.string().trim().optional().nullable(),
  preparedBy: z.string().trim().optional().nullable(),
  imagePath: z.string().trim().min(1),
  imageThumbPath: z.string().trim().optional().nullable(),
  orderId: z.string().trim().optional().nullable(),
  ocrRawResponse: z.unknown().optional(),
  ocrConfidenceNote: z.unknown().optional(),
  items: z.array(shipmentSlipItemSchema).min(1, "Cần ít nhất 1 dòng hàng hoá"),
});

export type CreateShipmentSlipInput = z.infer<typeof createShipmentSlipSchema>;
