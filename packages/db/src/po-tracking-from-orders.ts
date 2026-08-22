import { prisma } from "./index";
import { computeLineDeliveryFields, getSlipAggForAllLines, stripItemCodeVersionSuffix } from "./po-delivery-sync";

/**
 * Đồng bộ PoTrackingLine (Tiến độ giao hàng) TRỰC TIẾP từ Order/OrderItem đã đồng bộ AMIS —
 * thay cho việc anh phải gửi lại file Excel PO tracking (từ nay chỉ dùng làm dữ liệu gốc ban
 * đầu, không gửi lại nữa). Số PO trong AMIS CHÍNH LÀ Order.orderCode (= AMIS "sale_order_no")
 * — đã xác nhận bằng dữ liệu thật, không phải suy đoán (vd đơn D08.26DT52A anh báo "không tìm
 * thấy" đã có sẵn trong Order với đúng 4 dòng hàng khớp y hệt phiếu đi hàng anh upload).
 *
 * QUAN TRỌNG — tránh đếm trùng phần đã giao: hàm này CHỈ ghi các trường TĨNH của PO (SL đặt,
 * giá, khách hàng, hạn giao...), KHÔNG lấy trạng thái/giá trị đã giao từ AMIS. Phần "đã giao"
 * tiếp tục tính 100% từ Phiếu đi hàng như hiện tại (qua baseline + PoDeliveryEvent đã có) —
 * nếu lấy luôn số liệu giao hàng của AMIS thì sẽ cộng trùng với Phiếu đi hàng (AMIS và Phiếu
 * đi hàng đều phản ánh CÙNG 1 lần giao thật ngoài đời, cộng cả 2 sẽ ra số gấp đôi).
 *
 * Chạy sau mỗi lần đồng bộ AMIS đơn hàng thành công (xem apps/worker/src/sync/amis.ts) — dùng
 * lại đúng nút "Đồng bộ AMIS" đã có trên trang Đơn hàng, không cần thao tác gì thêm.
 */
export interface SyncPoTrackingFromOrdersResult {
  ordersScanned: number;
  linesCreated: number;
  linesUpdated: number;
  // Đổi mã hàng của dòng đã có sẵn (từ file Excel PO tracking cũ) sang đúng cách AMIS ghi mã —
  // vd Excel ghi "SB00286", AMIS ghi "SB00286.1" cho cùng 1 sản phẩm. Gộp vào đúng dòng cũ (giữ
  // nguyên baseline/lịch sử đã giao) thay vì tạo dòng mới → tránh tính GẤP ĐÔI giá trị PO.
  linesMigrated: number;
  // Trường hợp không tự gộp được chắc chắn (số dòng trùng mã không khớp giữa AMIS và Excel cũ)
  // — vẫn tạo dòng mới từ AMIS để không mất dữ liệu, nhưng liệt kê ra để rà soát tay tránh
  // trùng giá trị PO.
  ambiguousGroups: string[];
}


/** `orderCodes` (tuỳ chọn) giới hạn phạm vi chỉ 1 số PO cụ thể — dùng để đồng bộ lại đúng 1 PO
 * theo yêu cầu, hoặc để kiểm thử trên tập nhỏ trước khi chạy toàn bộ. Bỏ trống = chạy hết. */
export async function syncPoTrackingFromOrders(orderCodes?: string[]): Promise<SyncPoTrackingFromOrdersResult> {
  const orders = await prisma.order.findMany({
    where: { salesEmployeeId: { not: null }, ...(orderCodes ? { orderCode: { in: orderCodes } } : {}) },
    select: {
      orderCode: true,
      customerCode: true,
      salesEmployeeId: true,
      orderDate: true,
      expectedDeliveryDate: true,
      status: true,
      items: {
        select: { lineOrder: true, itemCode: true, itemName: true, quantity: true, unitPrice: true, totalPrice: true, unit: true, poCustomerItemCode: true },
        orderBy: { lineOrder: "asc" },
      },
    },
  });

  const slipAggByLine = await getSlipAggForAllLines();

  let linesCreated = 0;
  let linesUpdated = 0;
  let linesMigrated = 0;
  const ambiguousGroups: string[] = [];

  for (const order of orders) {
    if (order.items.length === 0) continue;
    const poCode = order.orderCode;
    const baselineClosed = order.status === "CANCELLED";

    // Gom dòng hàng AMIS theo ĐÚNG mã hàng (giữ thứ tự lineOrder = thứ tự AMIS trả về, tương
    // đương "thứ tự xuất hiện trong file" của cách làm Excel cũ).
    const amisGroups = new Map<string, typeof order.items>();
    for (const item of order.items) {
      const key = item.itemCode ?? item.itemName ?? "?";
      if (!amisGroups.has(key)) amisGroups.set(key, []);
      amisGroups.get(key)!.push(item);
    }

    const existingLines = await prisma.poTrackingLine.findMany({
      where: { poCode },
      select: {
        id: true,
        naturalKey: true,
        itemCode: true,
        itemName: true,
        baselineDeliveredValue: true,
        baselineDeliveredQty: true,
        baselineClosed: true,
        manuallyClosed: true,
      },
      orderBy: { naturalKey: "asc" },
    });
    // Nhóm dòng đã có sẵn theo mã GỐC (đã bỏ hậu tố ".N") để dò khả năng gộp với dữ liệu Excel
    // cũ ghi thiếu hậu tố phiên bản.
    const existingByBaseCode = new Map<string, typeof existingLines>();
    for (const line of existingLines) {
      const code = line.itemCode ?? line.itemName ?? "?";
      const base = stripItemCodeVersionSuffix(code);
      if (!existingByBaseCode.has(base)) existingByBaseCode.set(base, []);
      existingByBaseCode.get(base)!.push(line);
    }
    const claimedExistingIds = new Set<string>();

    for (const [itemKey, items] of amisGroups) {
      const targets: ((typeof existingLines)[number] | null)[] = new Array(items.length).fill(null);

      // 1) Khớp thẳng theo naturalKey CHO TỪNG occurrence độc lập (không yêu cầu cả nhóm phải
      //    khớp hết mới dùng — 1 nhóm có thể vừa có occurrence khớp thẳng vừa có occurrence cần
      //    khớp theo mã gốc ở bước 2, xử lý riêng từng dòng để không bỏ sót/tạo trùng).
      for (let i = 0; i < items.length; i++) {
        const key = `${poCode}::${itemKey}::${i + 1}`;
        const match = existingLines.find((l) => l.naturalKey === key && !claimedExistingIds.has(l.id));
        if (match) {
          targets[i] = match;
          claimedExistingIds.add(match.id);
        }
      }

      // 2) Các occurrence CHƯA khớp thẳng — dò theo mã GỐC (bỏ hậu tố ".N") trong dữ liệu đã có
      //    sẵn (thường là dòng cũ từ Excel PO tracking, ghi thiếu hậu tố phiên bản AMIS đang
      //    dùng). Chỉ ghép khi số dòng CÒN THIẾU đúng bằng số dòng cũ CÒN LẠI (chưa bị chiếm) —
      //    không suy đoán ghép nhầm khi số lượng không khớp.
      const missingIdx = targets.map((t, i) => (t == null ? i : -1)).filter((i) => i >= 0);
      if (missingIdx.length > 0) {
        const base = stripItemCodeVersionSuffix(itemKey);
        const candidates = (existingByBaseCode.get(base) ?? []).filter((l) => !claimedExistingIds.has(l.id));
        if (candidates.length === missingIdx.length) {
          missingIdx.forEach((idx, k) => {
            targets[idx] = candidates[k];
            claimedExistingIds.add(candidates[k].id);
          });
        } else if (candidates.length > 0) {
          // Có dòng cũ cùng mã gốc nhưng SỐ LƯỢNG không khớp — không suy đoán ghép nhầm, tạo
          // dòng mới từ AMIS để không mất dữ liệu, nhưng báo lại để anh rà soát tránh trùng.
          ambiguousGroups.push(
            `${poCode} / ${itemKey} (${missingIdx.length} dòng AMIS cần khớp, ${candidates.length} dòng cũ còn lại cùng mã gốc "${base}")`
          );
        }
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const poQuantity = Number(item.quantity);
        const contractPrice = Number(item.unitPrice);
        // KHÔNG dùng item.totalPrice (= "total" của AMIS) làm G.Trị PO — đã xác nhận bằng dữ
        // liệu thật rằng field này của AMIS BAO GỒM thuế GTGT 8% (vd SL 22.300 × Giá 280 =
        // 6.244.000, nhưng AMIS "total" = 6.743.520 = ×1.08), trong khi "G.Trị PO" ở file Excel
        // PO tracking cũ KHÔNG gồm thuế (đúng bằng SL × Giá HĐ). Tính lại theo đúng công thức
        // cũ để giữ nhất quán số liệu — nếu dùng thẳng total sẽ làm G.Trị PO tăng vọt 8% ngay
        // khi 1 dòng PO cũ (từ Excel) được đồng bộ lại từ AMIS.
        const poValue = poQuantity * contractPrice;
        const existing = targets[i];

        const slipAgg = existing ? slipAggByLine.get(existing.id) ?? { qty: 0, value: 0 } : { qty: 0, value: 0 };
        const computed = computeLineDeliveryFields(
          {
            poValue,
            poQuantity,
            baselineDeliveredValue: existing ? Number(existing.baselineDeliveredValue) : 0,
            baselineDeliveredQty: existing?.baselineDeliveredQty != null ? Number(existing.baselineDeliveredQty) : 0,
            baselineClosed: existing ? existing.baselineClosed || baselineClosed : baselineClosed,
            manuallyClosed: existing?.manuallyClosed ?? false,
          },
          slipAgg
        );

        const data = {
          nvkdCodeRaw: null,
          salesEmployeeId: order.salesEmployeeId,
          customerCode: order.customerCode,
          poCode,
          itemCode: item.itemCode,
          itemName: item.itemName,
          customerItemCode: item.poCustomerItemCode,
          poDate: order.orderDate,
          poQuantity,
          unit: item.unit,
          contractPrice,
          requestedDeliveryDate: order.expectedDeliveryDate,
          poValue,
          baselineClosed: existing ? existing.baselineClosed || baselineClosed : baselineClosed,
          ...computed,
        };

        if (existing) {
          const isMigration = existing.naturalKey !== `${poCode}::${itemKey}::${i + 1}`;
          await prisma.poTrackingLine.update({
            where: { id: existing.id },
            data: { ...data, naturalKey: `${poCode}::${itemKey}::${i + 1}` },
          });
          if (isMigration) linesMigrated++;
          else linesUpdated++;
        } else {
          await prisma.poTrackingLine.create({
            data: { ...data, naturalKey: `${poCode}::${itemKey}::${i + 1}`, baselineDeliveredValue: 0, baselineDeliveredQty: 0 },
          });
          linesCreated++;
        }
      }
    }
  }

  return { ordersScanned: orders.length, linesCreated, linesUpdated, linesMigrated, ambiguousGroups };
}
