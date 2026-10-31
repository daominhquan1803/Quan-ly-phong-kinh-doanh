# Đổi lỗi theo biên bản hàng lỗi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dòng phiếu đi hàng không có Số PO có thể xác nhận "đổi lỗi theo biên bản hàng lỗi"; đổi đủ thì biên bản tự hoàn thành; biên bản có thêm loại xử lý "huỷ tại kho khách, trừ công nợ".

**Architecture:** Thêm bảng `DefectReplacement` nối dòng phiếu với mã hàng lỗi của biên bản. Logic khớp và điều kiện hoàn thành nằm trong một file thuần (`defect-replacement.ts`) có test. Route mới xác nhận trong một transaction; bảng "Dòng phiếu cần sửa" gợi ý biên bản; form đóng biên bản thêm loại xử lý.

**Tech Stack:** Next.js 14, Prisma/Postgres, zod, vitest, React Query.

**Spec:** `docs/superpowers/specs/2026-10-31-doi-loi-theo-bien-ban-hang-loi-design.md`

## Global Constraints

- Chỉ hàng đổi lỗi nối biên bản; hàng bù hao (tặng) giữ nút bỏ qua, không nối biên bản.
- Admin xác nhận, không tự đóng biên bản.
- `closedAt` khi đổi lỗi đủ = ngày phiếu lớn nhất trong các phiếu đổi lỗi của biên bản (không dùng giờ bấm xác nhận).
- "Huỷ tại kho khách, trừ công nợ": bắt buộc số tiền trừ và số hoá đơn điều chỉnh; app không tạo bút toán công nợ.
- Không đổi cách tính doanh số (`PoDeliveryEvent`).
- Migration chỉ thêm cột/bảng. Thông điệp lỗi và giao diện bằng tiếng Việt.
- Số lượng đổi không được vượt SL lỗi còn thiếu và không vượt SL thực xuất của dòng phiếu (từ chối, không cắt).
- Sửa danh sách hàng của biên bản đã có phiếu đổi lỗi bị từ chối (tránh mất tiến độ do xoá/tạo lại dòng).

---

### Task 1: Schema và migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (User ~dòng 155, ShipmentSlipItem ~dòng 556, DefectReport ~dòng 1052, DefectReportItem ~dòng 1087)
- Create: `packages/db/prisma/migrations/20261031100000_defect_replacement/migration.sql`

**Interfaces:**
- Produces: enum `DefectResolutionType { REPLACED DESTROYED_DEDUCT_DEBT OTHER }`; `DefectReport.resolutionType`, `DefectReport.deductAmount`, `DefectReport.replacements`; model `DefectReplacement`.

- [ ] **Step 1: Sửa schema**

Trong `model User` thêm cạnh dòng `defectsClosed`:
```prisma
  defectReplacementsConfirmed DefectReplacement[] @relation("DefectReplacementConfirmedBy")
```
Trong `model ShipmentSlipItem` thêm sau `issueIgnored`:
```prisma
  defectReplacements DefectReplacement[]
```
Trong `model DefectReport` thêm sau `invoiceAdjustNote`:
```prisma
  // Loại xử lý khi đóng: đổi hàng theo biên bản / huỷ tại kho khách + trừ công nợ (kế toán điều chỉnh ở AMIS) / khác.
  resolutionType DefectResolutionType?
  deductAmount   Decimal?              @db.Decimal(18, 2)
```
và trong khối quan hệ của `DefectReport` (cạnh `photos DefectPhoto[]`):
```prisma
  replacements DefectReplacement[]
```
Trong `model DefectReportItem` thêm sau `defectQty`:
```prisma
  replacements DefectReplacement[]
```
Sau `enum DefectStatus` thêm:
```prisma
enum DefectResolutionType {
  REPLACED
  DESTROYED_DEDUCT_DEBT
  OTHER
}

/// Đợt đổi lỗi: 1 dòng phiếu đi hàng (không có PO) giao bù cho 1 mã hàng lỗi của biên bản. Admin xác nhận.
model DefectReplacement {
  id                 String           @id @default(cuid())
  defectReportId     String
  defectReport       DefectReport     @relation(fields: [defectReportId], references: [id], onDelete: Cascade)
  defectReportItemId String
  defectReportItem   DefectReportItem @relation(fields: [defectReportItemId], references: [id], onDelete: Cascade)
  shipmentSlipItemId String
  shipmentSlipItem   ShipmentSlipItem @relation(fields: [shipmentSlipItemId], references: [id], onDelete: Cascade)
  quantity           Decimal          @db.Decimal(14, 2)
  confirmedById      String
  confirmedBy        User             @relation("DefectReplacementConfirmedBy", fields: [confirmedById], references: [id])
  confirmedAt        DateTime         @default(now())

  @@index([defectReportId])
  @@index([defectReportItemId])
  @@index([shipmentSlipItemId])
  @@map("defect_replacements")
}
```

- [ ] **Step 2: Tạo migration**

`packages/db/prisma/migrations/20261031100000_defect_replacement/migration.sql`:
```sql
CREATE TYPE "DefectResolutionType" AS ENUM ('REPLACED', 'DESTROYED_DEDUCT_DEBT', 'OTHER');

ALTER TABLE "defect_reports" ADD COLUMN "resolutionType" "DefectResolutionType",
ADD COLUMN "deductAmount" DECIMAL(18,2);

CREATE TABLE "defect_replacements" (
    "id" TEXT NOT NULL,
    "defectReportId" TEXT NOT NULL,
    "defectReportItemId" TEXT NOT NULL,
    "shipmentSlipItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "defect_replacements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "defect_replacements_defectReportId_idx" ON "defect_replacements"("defectReportId");
CREATE INDEX "defect_replacements_defectReportItemId_idx" ON "defect_replacements"("defectReportItemId");
CREATE INDEX "defect_replacements_shipmentSlipItemId_idx" ON "defect_replacements"("shipmentSlipItemId");

ALTER TABLE "defect_replacements" ADD CONSTRAINT "defect_replacements_defectReportId_fkey" FOREIGN KEY ("defectReportId") REFERENCES "defect_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "defect_replacements" ADD CONSTRAINT "defect_replacements_defectReportItemId_fkey" FOREIGN KEY ("defectReportItemId") REFERENCES "defect_report_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "defect_replacements" ADD CONSTRAINT "defect_replacements_shipmentSlipItemId_fkey" FOREIGN KEY ("shipmentSlipItemId") REFERENCES "shipment_slip_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "defect_replacements" ADD CONSTRAINT "defect_replacements_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```
(Kiểm tra tên bảng User là `users` trong schema trước khi chạy; sửa nếu khác.)

- [ ] **Step 3: Validate và generate**

Run: `npx prisma validate --schema packages/db/prisma/schema.prisma` rồi `npx prisma generate --schema packages/db/prisma/schema.prisma` (tắt `node` đang giữ khoá nếu EPERM).
Expected: schema valid, client generated.

- [ ] **Step 4: Commit**
```bash
git add packages/db/prisma
git commit -m "feat(db): DefectReplacement + loai xu ly bien ban hang loi"
```

---

### Task 2: Hàm khớp và điều kiện hoàn thành (thuần)

**Files:**
- Create: `apps/web/src/lib/defect-replacement.ts`
- Test: `apps/web/src/lib/defect-replacement.test.ts`

**Interfaces:**
- Produces:
  - `type OpenDefectItem = { defectReportId: string; reportNumber: string; customerName: string | null; itemId: string; itemCode: string | null; itemName: string; defectQty: number; replacedQty: number }`
  - `type DefectCandidate = OpenDefectItem & { remaining: number; sameCustomer: boolean }`
  - `findDefectCandidates(slip: { itemCode: string | null; itemName: string; customerName: string | null }, open: OpenDefectItem[]): DefectCandidate[]`
  - `isDefectComplete(items: { defectQty: number; replacedQty: number }[]): boolean`
  - `latestDate(dates: (Date | null)[], fallback: Date): Date`

- [ ] **Step 1: Viết test (fail)**

```ts
import { describe, expect, it } from "vitest";
import { findDefectCandidates, isDefectComplete, latestDate, OpenDefectItem } from "./defect-replacement";

const D = (o: Partial<OpenDefectItem>): OpenDefectItem => ({
  defectReportId: "d1", reportNumber: "HL-1", customerName: "Công ty A", itemId: "i1",
  itemCode: "SB1", itemName: "Hộp SB1", defectQty: 100, replacedQty: 0, ...o,
});
const slip = { itemCode: "SB1.2", itemName: "Hộp SB1", customerName: "CÔNG TY  A" };

describe("findDefectCandidates", () => {
  it("khớp mã (bỏ hậu tố .N), cùng khách xếp trước", () => {
    const r = findDefectCandidates(slip, [D({ defectReportId: "d2", reportNumber: "HL-2", customerName: "Công ty B", itemId: "i2" }), D({})]);
    expect(r.map((x) => x.reportNumber)).toEqual(["HL-1", "HL-2"]);
    expect(r[0].sameCustomer).toBe(true);
    expect(r[1].sameCustomer).toBe(false);
  });
  it("khớp theo tên khi phiếu thiếu mã", () => {
    expect(findDefectCandidates({ ...slip, itemCode: null }, [D({ itemCode: "XX" })])).toHaveLength(1);
  });
  it("bỏ mã đã đổi đủ và mã khác", () => {
    expect(findDefectCandidates(slip, [D({ replacedQty: 100 }), D({ itemCode: "ZZ", itemName: "Khác", itemId: "i3" })])).toEqual([]);
  });
  it("remaining = SL lỗi - đã đổi", () => {
    expect(findDefectCandidates(slip, [D({ replacedQty: 40 })])[0].remaining).toBe(60);
  });
});

describe("isDefectComplete", () => {
  it("đủ khi mọi mã đã đổi >= SL lỗi", () => {
    expect(isDefectComplete([{ defectQty: 10, replacedQty: 10 }, { defectQty: 5, replacedQty: 5 }])).toBe(true);
    expect(isDefectComplete([{ defectQty: 10, replacedQty: 10 }, { defectQty: 5, replacedQty: 4 }])).toBe(false);
    expect(isDefectComplete([])).toBe(false);
  });
});

describe("latestDate", () => {
  it("lấy ngày lớn nhất, không có thì dùng fallback", () => {
    const f = new Date("2026-11-01");
    expect(latestDate([new Date("2026-10-20"), null, new Date("2026-10-25")], f)).toEqual(new Date("2026-10-25"));
    expect(latestDate([null], f)).toBe(f);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run apps/web/src/lib/defect-replacement.test.ts` (từ thư mục gốc repo hoặc `-w apps/web`, theo cách đang chạy test của repo)
Expected: FAIL "Cannot find module ./defect-replacement".

- [ ] **Step 3: Cài đặt**

```ts
import { stripItemCodeVersionSuffix } from "@hoanggia/db";

/** Mã hàng lỗi còn trong biên bản đang mở + số đã đổi (cộng dồn các DefectReplacement). */
export interface OpenDefectItem {
  defectReportId: string;
  reportNumber: string;
  customerName: string | null;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  defectQty: number;
  replacedQty: number;
}
export interface DefectCandidate extends OpenDefectItem {
  remaining: number;
  sameCustomer: boolean;
}

const MAX_CANDIDATES = 6;
const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Biên bản mở còn thiếu có cùng mã hàng (bỏ hậu tố .N) hoặc cùng tên với dòng phiếu; cùng khách xếp trước. Admin chọn biên bản đúng. */
export function findDefectCandidates(slip: { itemCode: string | null; itemName: string; customerName: string | null }, open: OpenDefectItem[]): DefectCandidate[] {
  const code = slip.itemCode ? stripItemCodeVersionSuffix(slip.itemCode) : null;
  const out: DefectCandidate[] = [];
  for (const d of open) {
    const remaining = d.defectQty - d.replacedQty;
    if (remaining <= 0) continue;
    const byCode = !!code && !!d.itemCode && stripItemCodeVersionSuffix(d.itemCode) === code;
    const byName = norm(d.itemName) !== "" && norm(d.itemName) === norm(slip.itemName);
    if (!byCode && !byName) continue;
    out.push({ ...d, remaining, sameCustomer: norm(slip.customerName) !== "" && norm(slip.customerName) === norm(d.customerName) });
  }
  return out.sort((a, b) => Number(b.sameCustomer) - Number(a.sameCustomer) || a.reportNumber.localeCompare(b.reportNumber)).slice(0, MAX_CANDIDATES);
}

export const isDefectComplete = (items: { defectQty: number; replacedQty: number }[]) => items.length > 0 && items.every((i) => i.replacedQty >= i.defectQty);

export function latestDate(dates: (Date | null)[], fallback: Date): Date {
  const ds = dates.filter((d): d is Date => !!d);
  return ds.length ? new Date(Math.max(...ds.map((d) => d.getTime()))) : fallback;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/defect-replacement.ts apps/web/src/lib/defect-replacement.test.ts
git commit -m "feat: ham khop va dieu kien hoan thanh doi loi theo bien ban"
```

---

### Task 3: Đóng biên bản với loại xử lý

**Files:**
- Modify: `apps/web/src/lib/defect-report.ts` (closeSchema, defectInclude)
- Modify: `apps/web/src/app/api/defects/[id]/route.ts` (close, reopen, sửa)
- Test: `apps/web/src/app/api/defects/route.test.ts` (thêm test vào file hiện có)

**Interfaces:**
- Consumes: Task 1 (cột `resolutionType`, `deductAmount`, quan hệ `replacements`).
- Produces: `closeSchema` nhận `resolutionType` (`REPLACED | DESTROYED_DEDUCT_DEBT | OTHER`, mặc định `OTHER`) và `deductAmount`; `defectInclude.replacements`.

- [ ] **Step 1: Viết test (fail)** — thêm vào cuối `route.test.ts`, dùng các helper có sẵn (`ADMIN`, `req`, mock `findUnique`/`update`):

```ts
describe("đóng biên bản: huỷ tại kho khách, trừ công nợ", () => {
  const close = { action: "close", resolution: "Khách giữ hàng, trừ vào hoá đơn", invoiceAdjusted: true, adjustedInvoiceNumbers: "0003", invoiceAdjustNote: "giảm 5tr", resolutionType: "DESTROYED_DEDUCT_DEBT", deductAmount: 5000000 };
  beforeEach(() => {
    h.auth.mockResolvedValue(ADMIN);
    h.findUnique.mockResolvedValue({ id: "d1", status: "OPEN" });
  });
  it("đủ số tiền + hoá đơn thì đóng, lưu loại xử lý", async () => {
    const res = await PATCH(req("/api/defects/d1", "PATCH", close), { params: { id: "d1" } });
    expect(res.status).toBe(200);
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: "CLOSED", resolutionType: "DESTROYED_DEDUCT_DEBT", deductAmount: 5000000 });
  });
  it("THẤT BẠI: thiếu số tiền trừ hoặc không sửa hoá đơn -> 400", async () => {
    for (const bad of [{ ...close, deductAmount: null }, { ...close, invoiceAdjusted: false }, { ...close, adjustedInvoiceNumbers: "" }]) {
      expect((await PATCH(req("/api/defects/d1", "PATCH", bad), { params: { id: "d1" } })).status).toBe(400);
    }
    expect(h.update).not.toHaveBeenCalled();
  });
  it("loại khác không lưu số tiền trừ", async () => {
    await PATCH(req("/api/defects/d1", "PATCH", { action: "close", resolution: "Đã xử lý", invoiceAdjusted: false }), { params: { id: "d1" } });
    expect(h.update.mock.calls[0][0].data).toMatchObject({ resolutionType: "OTHER", deductAmount: null });
  });
  it("biên bản đã có phiếu đổi lỗi thì không sửa danh sách hàng", async () => {
    h.findUnique.mockResolvedValue({ id: "d1", status: "OPEN", _count: { replacements: 1 } });
    const res = await PATCH(req("/api/defects/d1", "PATCH", valid), { params: { id: "d1" } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run apps/web/src/app/api/defects/route.test.ts`

- [ ] **Step 3: Cài đặt**

`defect-report.ts`: thêm trước `closeSchema`:
```ts
export const DEFECT_RESOLUTION_TYPES = ["REPLACED", "DESTROYED_DEDUCT_DEBT", "OTHER"] as const;
```
Thêm vào object của `closeSchema` (sau `invoiceAdjustNote`):
```ts
    resolutionType: z.enum(DEFECT_RESOLUTION_TYPES).default("OTHER"),
    deductAmount: z.coerce.number().positive("Số tiền trừ phải lớn hơn 0").max(1e13).optional().nullable(),
```
Thêm refine thứ hai sau refine hiện có:
```ts
  .refine((b) => b.resolutionType !== "DESTROYED_DEDUCT_DEBT" || (!!b.deductAmount && b.invoiceAdjusted && !!b.adjustedInvoiceNumbers), {
    message: "Huỷ tại kho khách, trừ công nợ: nhập số tiền trừ và số hoá đơn điều chỉnh",
    path: ["deductAmount"],
  });
```
(đổi dấu `;` cuối refine cũ thành xuống dòng nối tiếp). Trong `defectInclude` thêm:
```ts
  replacements: {
    select: { id: true, defectReportItemId: true, quantity: true, shipmentSlipItem: { select: { shipmentSlip: { select: { id: true, slipNumber: true, slipDate: true } } } } },
    orderBy: { confirmedAt: "asc" as const },
  },
```

`api/defects/[id]/route.ts`:
- `current` select thêm `_count: { select: { replacements: true } }`.
- reopen: `data: { status: "OPEN", closedAt: null, closedById: null, resolutionType: null, deductAmount: null }`.
- close: thêm vào `data`:
```ts
          resolutionType: c.resolutionType,
          deductAmount: c.resolutionType === "DESTROYED_DEDUCT_DEBT" ? c.deductAmount ?? null : null,
```
- sửa (sau dòng kiểm tra `CLOSED`):
```ts
    if ((current._count?.replacements ?? 0) > 0) return NextResponse.json({ error: "Biên bản đã có phiếu đổi lỗi, không sửa được danh sách hàng" }, { status: 400 });
```

- [ ] **Step 4: Run, expect PASS** (cả file test hiện có phải vẫn pass)

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/defect-report.ts apps/web/src/app/api/defects
git commit -m "feat: dong bien ban voi loai xu ly (huy tai kho khach tru cong no)"
```

---

### Task 4: API gợi ý và xác nhận đổi lỗi

**Files:**
- Modify: `apps/web/src/app/api/shipment-slips/issues/route.ts`
- Create: `apps/web/src/app/api/shipment-slips/items/[id]/defect-replacement/route.ts`
- Test: `apps/web/src/app/api/shipment-slips/items/[id]/defect-replacement/route.test.ts`

**Interfaces:**
- Consumes: Task 2 (`findDefectCandidates`, `isDefectComplete`, `latestDate`, `OpenDefectItem`), Task 1.
- Produces: `GET /api/shipment-slips/issues` mỗi issue có thêm `defectCandidates: DefectCandidate[]` (chỉ `NO_PO`); `POST .../defect-replacement` body `{ defectReportItemId: string, quantity: number }` trả `{ ok: true, closed: boolean }`.

- [ ] **Step 1: Viết test (fail)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ auth: vi.fn(), slipItem: vi.fn(), tx: {} as Record<string, any> }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: { shipmentSlipItem: { findUnique: h.slipItem }, $transaction: (cb: (tx: unknown) => unknown) => cb(h.tx) },
  Prisma: {},
}));

import { POST } from "./route";

const ADMIN = { user: { id: "u-quan", role: "ADMIN", accessLevel: "FULL" } };
const SALES = { user: { id: "u-tung", role: "SALES", accessLevel: "FULL" } };
const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: { id: "si1" } });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(ADMIN);
  h.slipItem.mockResolvedValue({ id: "si1", qtyActual: 100 });
  h.tx = {
    defectReportItem: {
      findUnique: vi.fn().mockResolvedValue({ id: "di1", defectReportId: "d1", defectQty: 100, defectReport: { status: "OPEN" } }),
      findMany: vi.fn().mockResolvedValue([{ id: "di1", defectQty: 100 }]),
    },
    defectReplacement: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
      create: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([{ defectReportItemId: "di1", _sum: { quantity: 100 } }]),
      findMany: vi.fn().mockResolvedValue([{ shipmentSlipItem: { shipmentSlip: { slipNumber: "BH1", slipDate: new Date("2026-10-30") } } }]),
    },
    shipmentSlipItem: { update: vi.fn().mockResolvedValue({}) },
    defectReport: { update: vi.fn().mockResolvedValue({}) },
  };
});

describe("xác nhận đổi lỗi", () => {
  it("quyền: Kinh doanh bị từ chối", async () => {
    h.auth.mockResolvedValue(SALES);
    expect((await call({ defectReportItemId: "di1", quantity: 10 })).status).toBe(403);
  });
  it("đổi đủ thì đóng biên bản, closedAt = ngày phiếu, đánh dấu dòng phiếu bỏ qua", async () => {
    const res = await call({ defectReportItemId: "di1", quantity: 100 });
    expect(await res.json()).toEqual({ ok: true, closed: true });
    expect(h.tx.shipmentSlipItem.update).toHaveBeenCalledWith({ where: { id: "si1" }, data: { issueIgnored: true } });
    expect(h.tx.defectReport.update.mock.calls[0][0].data).toMatchObject({ status: "CLOSED", resolutionType: "REPLACED", closedAt: new Date("2026-10-30"), closedById: "u-quan" });
  });
  it("đổi thiếu thì giữ biên bản mở", async () => {
    h.tx.defectReplacement.groupBy.mockResolvedValue([{ defectReportItemId: "di1", _sum: { quantity: 60 } }]);
    const res = await call({ defectReportItemId: "di1", quantity: 60 });
    expect(await res.json()).toEqual({ ok: true, closed: false });
    expect(h.tx.defectReport.update).not.toHaveBeenCalled();
  });
  it("THẤT BẠI: vượt SL thực xuất, vượt SL lỗi còn thiếu, biên bản đã đóng", async () => {
    expect((await call({ defectReportItemId: "di1", quantity: 101 })).status).toBe(400);
    h.tx.defectReplacement.aggregate.mockResolvedValueOnce({ _sum: { quantity: 0 } }).mockResolvedValueOnce({ _sum: { quantity: 50 } });
    expect((await call({ defectReportItemId: "di1", quantity: 60 })).status).toBe(400);
    h.tx.defectReportItem.findUnique.mockResolvedValue({ id: "di1", defectReportId: "d1", defectQty: 100, defectReport: { status: "CLOSED" } });
    expect((await call({ defectReportItemId: "di1", quantity: 10 })).status).toBe(400);
    expect(h.tx.defectReplacement.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Cài đặt route xác nhận**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { isDefectComplete, latestDate } from "@/lib/defect-replacement";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  defectReportItemId: z.string().trim().min(1, "Chọn mã hàng lỗi của biên bản"),
  quantity: z.coerce.number().positive("Số lượng đổi phải lớn hơn 0").max(1e9),
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Admin xác nhận dòng phiếu (không có PO) là hàng ĐỔI LỖI theo 1 mã hàng lỗi của biên bản đang mở. Cộng dồn SL đổi; mọi mã đã đổi
 * đủ thì biên bản hoàn thành (loại REPLACED, closedAt = ngày phiếu lớn nhất). Dòng phiếu được đánh dấu bỏ qua -> hết cảnh báo thiếu PO.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { defectReportItemId, quantity } = parsed.data;

    const slipItem = await prisma.shipmentSlipItem.findUnique({ where: { id: params.id }, select: { id: true, qtyActual: true } });
    if (!slipItem) return NextResponse.json({ error: "Không tìm thấy dòng phiếu" }, { status: 404 });

    const closed = await prisma.$transaction(async (tx) => {
      const di = await tx.defectReportItem.findUnique({
        where: { id: defectReportItemId },
        select: { id: true, defectReportId: true, defectQty: true, defectReport: { select: { status: true } } },
      });
      if (!di) throw new HttpError(404, "Không tìm thấy mã hàng lỗi");
      if (di.defectReport.status !== "OPEN") throw new HttpError(400, "Biên bản đã đóng");

      const usedBySlip = Number((await tx.defectReplacement.aggregate({ where: { shipmentSlipItemId: slipItem.id }, _sum: { quantity: true } }))._sum.quantity ?? 0);
      if (usedBySlip + quantity > Number(slipItem.qtyActual ?? 0)) throw new HttpError(400, "Vượt SL thực xuất của dòng phiếu");
      const replaced = Number((await tx.defectReplacement.aggregate({ where: { defectReportItemId }, _sum: { quantity: true } }))._sum.quantity ?? 0);
      if (replaced + quantity > Number(di.defectQty)) throw new HttpError(400, "Vượt SL lỗi còn thiếu của mã hàng này");

      await tx.defectReplacement.create({
        data: { defectReportId: di.defectReportId, defectReportItemId, shipmentSlipItemId: slipItem.id, quantity, confirmedById: session.user.id },
      });
      await tx.shipmentSlipItem.update({ where: { id: slipItem.id }, data: { issueIgnored: true } });

      const items = await tx.defectReportItem.findMany({ where: { defectReportId: di.defectReportId }, select: { id: true, defectQty: true } });
      const sums = await tx.defectReplacement.groupBy({ by: ["defectReportItemId"], where: { defectReportId: di.defectReportId }, _sum: { quantity: true } });
      const replacedOf = new Map(sums.map((s) => [s.defectReportItemId, Number(s._sum.quantity ?? 0)]));
      if (!isDefectComplete(items.map((i) => ({ defectQty: Number(i.defectQty), replacedQty: replacedOf.get(i.id) ?? 0 })))) return false;

      const reps = await tx.defectReplacement.findMany({
        where: { defectReportId: di.defectReportId },
        select: { shipmentSlipItem: { select: { shipmentSlip: { select: { slipNumber: true, slipDate: true } } } } },
      });
      const slips = reps.map((r) => r.shipmentSlipItem.shipmentSlip);
      const numbers = Array.from(new Set(slips.map((s) => s.slipNumber)));
      await tx.defectReport.update({
        where: { id: di.defectReportId },
        data: {
          status: "CLOSED",
          closedAt: latestDate(slips.map((s) => s.slipDate), new Date()),
          closedById: session.user.id,
          resolutionType: "REPLACED",
          resolution: `Đổi lỗi theo phiếu ${numbers.join(", ")}`,
          invoiceAdjusted: false,
        },
      });
      return true;
    });
    return NextResponse.json({ ok: true, closed });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipment-slips/items/[id]/defect-replacement POST error", err);
    return NextResponse.json({ error: "Không xác nhận được đổi lỗi" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Gợi ý trong `issues/route.ts`**

Thêm import `findDefectCandidates, OpenDefectItem` từ `@/lib/defect-replacement`. Trong `Promise.all` thêm truy vấn thứ ba:
```ts
      prisma.defectReport.findMany({
        where: { status: "OPEN" },
        select: {
          id: true,
          reportNumber: true,
          customerName: true,
          items: { select: { id: true, itemCode: true, itemName: true, defectQty: true } },
          replacements: { select: { defectReportItemId: true, quantity: true } },
        },
      }),
```
(đặt tên biến `openDefects`). Sau khi dựng `linesByPo`:
```ts
    const openItems: OpenDefectItem[] = openDefects.flatMap((d) =>
      d.items.map((i) => ({
        defectReportId: d.id,
        reportNumber: d.reportNumber,
        customerName: d.customerName,
        itemId: i.id,
        itemCode: i.itemCode,
        itemName: i.itemName,
        defectQty: Number(i.defectQty),
        replacedQty: d.replacements.filter((r) => r.defectReportItemId === i.id).reduce((s, r) => s + Number(r.quantity), 0),
      }))
    );
```
Trong `.map` của `issues`, thêm vào object trả về:
```ts
defectCandidates: issue.kind === "NO_PO" ? findDefectCandidates({ itemCode: it.itemCode, itemName: it.itemName, customerName: it.shipmentSlip.customerName }, openItems) : [],
```

- [ ] **Step 5: Run test, expect PASS; `npx tsc --noEmit -p apps/web`**

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/app/api/shipment-slips
git commit -m "feat: xac nhan doi loi theo bien ban tu dong phieu di hang"
```

---

### Task 5: Bảng "Dòng phiếu cần sửa" — nút đổi lỗi

**Files:**
- Modify: `apps/web/src/components/shipment-slips/SlipIssuesPanel.tsx`

**Interfaces:**
- Consumes: Task 4 (`defectCandidates`, route `defect-replacement`).

- [ ] **Step 1: Cài đặt**

Thêm vào `interface Issue`:
```ts
  defectCandidates: { defectReportId: string; reportNumber: string; customerName: string | null; itemId: string; itemCode: string | null; itemName: string; remaining: number; sameCustomer: boolean }[];
```
Trong `refresh` thêm `queryClient.invalidateQueries({ queryKey: ["defects"] });` (kiểm tra queryKey thật của DefectsPage trước, sửa cho khớp).

Trong `IssueRow` thêm state và mutation:
```tsx
  const cands = issue.defectCandidates ?? [];
  const [defectItemId, setDefectItemId] = useState(cands[0]?.itemId ?? "");
  const picked = cands.find((c) => c.itemId === defectItemId);
  const [replaceQty, setReplaceQty] = useState(String(Math.min(issue.qtyActual ?? 0, cands[0]?.remaining ?? 0) || ""));
  const replace = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/shipment-slips/items/${issue.itemId}/defect-replacement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defectReportItemId: defectItemId, quantity: Number(replaceQty) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không xác nhận được");
    },
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : "Không xác nhận được"),
  });
```
Thêm khối JSX ngay trước `<div className="mt-2 flex items-center gap-3">` (hàng nút bỏ qua):
```tsx
      {cands.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
          <span className="font-semibold text-emerald-300">Đổi lỗi theo biên bản:</span>
          <select
            value={defectItemId}
            onChange={(e) => {
              setDefectItemId(e.target.value);
              const c = cands.find((x) => x.itemId === e.target.value);
              setReplaceQty(String(Math.min(issue.qtyActual ?? 0, c?.remaining ?? 0) || ""));
            }}
            className={`${inputCls} w-auto`}
            aria-label="Biên bản hàng lỗi"
          >
            {cands.map((c) => (
              <option key={c.itemId} value={c.itemId}>
                {c.reportNumber} · {c.customerName ?? "—"} · còn thiếu {c.remaining}
                {c.sameCustomer ? "" : " (khác khách)"}
              </option>
            ))}
          </select>
          <input value={replaceQty} onChange={(e) => setReplaceQty(e.target.value)} inputMode="decimal" className={`${inputCls} w-24`} aria-label="SL đổi" />
          <button
            disabled={!picked || !(Number(replaceQty) > 0) || replace.isPending}
            onClick={() => {
              setError(null);
              replace.mutate();
            }}
            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            {replace.isPending ? "Đang lưu..." : "Xác nhận đổi lỗi"}
          </button>
        </div>
      )}
```
Đổi chữ nút bỏ qua thành `Hàng tặng / bù hao (bỏ qua)`, giữ `title`.

- [ ] **Step 2: `npx tsc --noEmit -p apps/web`** — Expected: không lỗi.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/shipment-slips/SlipIssuesPanel.tsx
git commit -m "feat: nut xac nhan doi loi trong bang dong phieu can sua"
```

---

### Task 6: Trang Hàng lỗi — tiến độ đổi và loại xử lý

**Files:**
- Modify: `apps/web/src/components/defects/types.ts`
- Modify: `apps/web/src/components/defects/DefectsPage.tsx` (DefectDetail ~dòng 188-400)

**Interfaces:**
- Consumes: Task 3 (`defectInclude.replacements`, `resolutionType`, `deductAmount`).

- [ ] **Step 1: Types** — thêm vào `DefectRow`:
```ts
  resolutionType: "REPLACED" | "DESTROYED_DEDUCT_DEBT" | "OTHER" | null;
  deductAmount: string | null;
  replacements: { id: string; defectReportItemId: string; quantity: string; shipmentSlipItem: { shipmentSlip: { id: string; slipNumber: string; slipDate: string | null } } }[];
```

- [ ] **Step 2: DefectDetail**

Thêm state `const [resolutionType, setResolutionType] = useState<"OTHER" | "REPLACED" | "DESTROYED_DEDUCT_DEBT">("OTHER"); const [deductAmount, setDeductAmount] = useState("");`.
Thêm hằng trên component: `const RESOLUTION_LABEL = { REPLACED: "Đổi hàng theo biên bản", DESTROYED_DEDUCT_DEBT: "Huỷ tại kho khách, trừ công nợ", OTHER: "Khác" } as const;`.

Bảng mặt hàng: thêm cột `<th className="text-right font-medium py-1">Đã đổi</th>` sau "SL lỗi" và ô
```tsx
<td className="py-1 text-right">{fmtQty(String(d.replacements.filter((r) => r.defectReportItemId === i.id).reduce((s, r) => s + Number(r.quantity), 0)))} / {fmtQty(i.defectQty)}</td>
```
Dưới bảng, nếu `d.replacements.length > 0`:
```tsx
<p className="text-xs text-muted2">
  Phiếu đổi lỗi: {Array.from(new Map(d.replacements.map((r) => [r.shipmentSlipItem.shipmentSlip.id, r.shipmentSlipItem.shipmentSlip])).values()).map((s) => s.slipNumber).join(", ")}
</p>
```
Khối `CLOSED`: thêm dòng
```tsx
{d.resolutionType && (
  <p>
    <span className="text-muted2">Loại xử lý:</span> {RESOLUTION_LABEL[d.resolutionType]}
    {d.resolutionType === "DESTROYED_DEDUCT_DEBT" && d.deductAmount ? <> — trừ <b>{Number(d.deductAmount).toLocaleString("vi-VN")}đ</b></> : null}
  </p>
)}
```
Form đóng: trước ô "Đã xử lý thế nào" thêm
```tsx
<div className="space-y-1">
  <p className="text-xs text-muted2">Loại xử lý *</p>
  <select
    className={input}
    value={resolutionType}
    onChange={(e) => {
      const v = e.target.value as typeof resolutionType;
      setResolutionType(v);
      if (v === "DESTROYED_DEDUCT_DEBT") setInvoiceAdjusted(true);
    }}
  >
    <option value="OTHER">Khác</option>
    <option value="REPLACED">Đổi hàng theo biên bản</option>
    <option value="DESTROYED_DEDUCT_DEBT">Huỷ tại kho khách, trừ công nợ</option>
  </select>
</div>
{resolutionType === "DESTROYED_DEDUCT_DEBT" && (
  <div className="space-y-1">
    <p className="text-xs text-muted2">Số tiền trừ công nợ (đ) *</p>
    <input className={input} inputMode="decimal" value={deductAmount} onChange={(e) => setDeductAmount(e.target.value)} placeholder="vd 5000000" />
  </div>
)}
```
Radio "Có sửa hoá đơn": thêm `disabled={resolutionType === "DESTROYED_DEDUCT_DEBT"}` cho cả hai input radio. Body của nút "Xác nhận đóng" thêm `resolutionType, deductAmount: deductAmount ? Number(deductAmount) : null`.

- [ ] **Step 3: `npx tsc --noEmit -p apps/web`** và `npx vitest run` (toàn bộ apps/web)

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/components/defects
git commit -m "feat: trang hang loi hien tien do doi va loai xu ly"
```

---

### Task 7: Kiểm tra toàn bộ và deploy

- [ ] **Step 1:** `npx tsc --noEmit -p apps/web` và `npx vitest run` — tất cả pass.
- [ ] **Step 2:** Push và chạy workflow deploy (workflow tự chạy `prisma migrate deploy`): `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -q origin HEAD:refs/heads/main; git branch -f main HEAD; gh workflow run deploy.yml`, rồi `gh run watch`.
- [ ] **Step 3:** Kiểm tra prod chỉ đọc: bảng `defect_replacements` tồn tại, cột `resolutionType` có.
