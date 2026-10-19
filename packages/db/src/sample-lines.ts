import { prisma } from "./index";

/**
 * Hàng mẫu (anh Quân chốt 19/10/2026): đơn/dòng hàng AMIS có ghi chú "Hàng mẫu" thì KHÔNG tính doanh số.
 * Ghi chú nằm ở cột tuỳ biến của dòng hàng (custom_field3/4/6/7 tuỳ mẫu phiếu) hoặc ở mô tả; cả đơn mẫu thì ghi ở tên đơn
 * ("Hàng Mẫu không tính tiền"). KHÔNG quét custom_field5 (quy cách kỹ thuật, hay có "bám màu theo hàng mẫu của khách") và
 * KHÔNG nhận "FOC bù hao" (anh chưa yêu cầu).
 */
const SAMPLE_RE = /hàng\s*mẫu|^\s*mẫu\s*$|\bsample\b|mẫu\s*không\s*tính\s*tiền/i;

export function isSampleNote(text: string | null | undefined): boolean {
  return !!text && text.length <= 200 && SAMPLE_RE.test(text);
}

export interface SampleMappingFields {
  description?: string | null;
  custom_field3?: string | null;
  custom_field4?: string | null;
  custom_field6?: string | null;
  custom_field7?: string | null;
}

/** Dòng hàng AMIS là hàng mẫu nếu một trong các cột ghi chú của dòng khớp. */
export function isSampleMapping(m: SampleMappingFields): boolean {
  return [m.custom_field3, m.custom_field4, m.custom_field6, m.custom_field7, m.description].some(isSampleNote);
}

/** Cả đơn là đơn mẫu (ghi ở tên đơn hoặc ghi chú cấp đơn). */
export function isSampleOrder(o: { sale_order_name?: string | null; custom_field4?: string | null }): boolean {
  return isSampleNote(o.sale_order_name) || isSampleNote(o.custom_field4);
}

/**
 * Đưa giá trị của mọi dòng PO hàng mẫu về 0 (giá, G.Trị PO, giá trị đã giao/còn lại, giá trị các đợt giao) để doanh số
 * không tính hàng mẫu — kể cả sau khi nhập lại file PO tracking Excel ghi đè giá trị. SL vẫn giữ để theo dõi giao.
 */
export async function zeroSampleLineValues(): Promise<number> {
  await prisma.$executeRaw`UPDATE "po_delivery_events" e SET "value" = 0 FROM "po_tracking_lines" l WHERE e."lineId" = l."id" AND l."isSample" AND e."value" <> 0`;
  return prisma.$executeRaw`UPDATE "po_tracking_lines" SET "poValue" = 0, "contractPrice" = 0, "actualPrice" = 0, "deliveredValue" = 0, "remainingValue" = 0, "baselineDeliveredValue" = 0 WHERE "isSample" AND ("poValue" <> 0 OR "deliveredValue" <> 0 OR "remainingValue" <> 0 OR "baselineDeliveredValue" <> 0 OR COALESCE("contractPrice", 0) <> 0)`;
}
