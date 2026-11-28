import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma giả giữ đợt giao trong bộ nhớ: đủ để chạy applyShipmentSlipDeliveries.
const h = vi.hoisted(() => {
  const events: { lineId: string; quantity: number; value: number; sourceShipmentSlipId: string }[] = [];
  const lines = [2, 2, 1, 1].map((poQuantity, i) => ({
    id: `L${i + 1}`,
    naturalKey: `PO::A::${i + 1}`,
    contractPrice: 10,
    poValue: poQuantity * 10,
    poQuantity,
    salesEmployeeId: "u1",
    baselineDeliveredQty: 0,
    baselineDeliveredValue: 0,
    baselineClosed: false,
    manuallyClosed: false,
    isSample: false,
    importBatch: null,
  }));
  const sum = (lineId: string) => {
    const own = events.filter((e) => e.lineId === lineId);
    return { _sum: { quantity: own.reduce((s, e) => s + e.quantity, 0), value: own.reduce((s, e) => s + e.value, 0) } };
  };
  const prisma = {
    poDeliveryEvent: {
      findMany: async () => [],
      deleteMany: async () => ({}),
      create: async ({ data }: { data: (typeof events)[number] }) => events.push(data),
      aggregate: async ({ where }: { where: { lineId: string } }) => sum(where.lineId),
    },
    poTrackingLine: {
      findMany: async () => lines,
      findUnique: async ({ where }: { where: { id: string } }) => lines.find((l) => l.id === where.id),
      update: async () => ({}),
    },
    shipmentSlip: { findUnique: async () => ({ slipNumber: "BH1" }) },
  };
  return { events, prisma };
});
vi.mock("../../../../packages/db/src/index", () => ({ prisma: h.prisma }));

import { applyShipmentSlipDeliveries } from "../../../../packages/db/src/po-delivery-sync";

beforeEach(() => {
  h.events.length = 0;
});

const perLine = () => ["L1", "L2", "L3", "L4"].map((id) => h.events.filter((e) => e.lineId === id).reduce((s, e) => s + e.quantity, 0));
const item = { itemCode: "A", itemName: "Máy", poSaleNumber: "PO", qtyActual: 1 };

describe("applyShipmentSlipDeliveries — nhiều dòng PO cùng mã", () => {
  it("phiếu có nhiều dòng cùng mã: trừ đúng sức chứa từng dòng, không dồn vào dòng cuối", async () => {
    await applyShipmentSlipDeliveries("s1", new Date("2026-11-24"), Array.from({ length: 6 }, () => item));
    expect(perLine()).toEqual([2, 2, 1, 1]);
  });

  it("THẤT BẠI: giao dư hơn tổng PO -> phần dư vào dòng cuối, không mất số", async () => {
    await applyShipmentSlipDeliveries("s1", new Date("2026-11-24"), Array.from({ length: 8 }, () => item));
    expect(perLine()).toEqual([2, 2, 1, 3]);
  });
});
