# Gợi ý khách khi đăng ký công tác — Bước 1: tỉnh, bảng thông báo, bảng khách gợi ý (chỉ xem)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng ký công tác có Tỉnh/TP; đầu trang Đăng ký công tác hiện bảng thông báo chung các chuyến sắp đi, mở ra thấy khách gợi ý trong tỉnh kèm NVKD phụ trách, số ngày chưa mua, số ngày chưa liên hệ.

**Architecture:** Thêm cột `provinces` vào `BusinessTripRequest`. Hàm thuần chuẩn hoá tỉnh (gộp tên tỉnh cũ sang tỉnh sau sáp nhập 2025) và hàm chọn/xếp khách gợi ý có test. Hai API mới (danh sách chuyến sắp đi cho mọi người, gợi ý theo chuyến). Một component bảng thông báo đặt đầu `BusinessTripsPanel`.

**Tech Stack:** Next.js 14, Prisma/Postgres, zod, vitest, React Query.

**Spec:** `docs/superpowers/specs/2026-10-31-goi-y-khach-cong-tac-design.md` (bước 1 trong mục "Làm theo thứ tự").

## Global Constraints

- Chưa có nút thao tác (tham gia, đi hộ, nhận khách) — thuộc bước 4. Bảng gợi ý chỉ xem.
- Không đổi cách tính điểm gặp khách (bước 2).
- Tỉnh bắt buộc với chuyến đăng ký mới (tạo và sửa); chuyến cũ để trống vẫn hiển thị bình thường.
- Gợi ý: cùng tỉnh, có đơn trong 24 tháng, kể cả khách chưa phân NVKD, loại khách của người đi chính và khách đã là điểm dừng của chuyến, xếp chưa liên hệ lâu nhất trước, tối đa 15.
- "Chưa liên hệ" lấy từ `lastTouchAt` của báo cáo hồ sơ khách (lần chăm sóc hoặc gặp gần nhất); "chưa mua" từ `lastOrderAt`.
- Bảng thông báo hiện cho mọi người dùng đã đăng nhập; chuyến chưa qua ngày đi, trạng thái khác REJECTED.

---

### Task 1: Cột `provinces` và migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`model BusinessTripRequest`)
- Create: `packages/db/prisma/migrations/20261031160000_trip_provinces/migration.sql`

- [ ] **Step 1:** Trong `model BusinessTripRequest` thêm sau `visitDate`:
```prisma
  // Tỉnh/TP của chuyến (bắt buộc với chuyến đăng ký mới, chuyến cũ để trống) — dùng gợi ý khách trong tỉnh cho cả phòng.
  provinces    String[]   @default([])
```
- [ ] **Step 2:** `migration.sql`:
```sql
ALTER TABLE "business_trip_requests" ADD COLUMN "provinces" TEXT[] DEFAULT ARRAY[]::TEXT[];
```
- [ ] **Step 3:** `npm run generate --workspace=packages/db` — Expected: Generated Prisma Client. Commit: `feat(db): tinh/TP cua chuyen cong tac`.

---

### Task 2: Chuẩn hoá tỉnh (hàm thuần)

**Files:**
- Create: `apps/web/src/lib/vn-provinces.ts`
- Test: `apps/web/src/lib/vn-provinces.test.ts`

**Interfaces:**
- Produces: `PROVINCES: string[]` (34 tỉnh/TP hiện hành, để chọn trong form), `canonicalProvince(name: string | null | undefined): string | null`, `sameProvince(a: string | null | undefined, b: string | null | undefined): boolean`.

- [ ] **Step 1: Test (fail)**
```ts
import { describe, expect, it } from "vitest";
import { canonicalProvince, PROVINCES, sameProvince } from "./vn-provinces";

describe("chuẩn hoá tỉnh", () => {
  it("bỏ tiền tố Tỉnh / TP, không phân biệt hoa thường dấu", () => {
    expect(canonicalProvince("Tỉnh Hưng Yên")).toBe("Hưng Yên");
    expect(canonicalProvince("thành phố hải phòng")).toBe("Hải Phòng");
    expect(canonicalProvince("TP. Hồ Chí Minh")).toBe("TP. Hồ Chí Minh");
    expect(canonicalProvince("Bac Ninh")).toBe("Bắc Ninh");
  });
  it("gộp tỉnh cũ vào tỉnh sau sáp nhập 2025", () => {
    expect(canonicalProvince("Bắc Giang")).toBe("Bắc Ninh");
    expect(canonicalProvince("Thái Bình")).toBe("Hưng Yên");
    expect(canonicalProvince("Hải Dương")).toBe("Hải Phòng");
    expect(canonicalProvince("Bình Dương")).toBe("TP. Hồ Chí Minh");
    expect(sameProvince("Tỉnh Thái Bình", "Hưng Yên")).toBe(true);
    expect(sameProvince("Hà Nội", "Bắc Ninh")).toBe(false);
  });
  it("không nhận ra hoặc rỗng thì null / false", () => {
    expect(canonicalProvince("Nước ngoài")).toBeNull();
    expect(canonicalProvince(null)).toBeNull();
    expect(sameProvince(null, "Hà Nội")).toBe(false);
  });
  it("danh sách chọn có 34 tỉnh/TP", () => {
    expect(PROVINCES).toHaveLength(34);
    expect(PROVINCES.every((p) => canonicalProvince(p) === p)).toBe(true);
  });
});
```
- [ ] **Step 2:** `npx vitest run src/lib/vn-provinces.test.ts` — Expected FAIL (module chưa có).
- [ ] **Step 3: Cài đặt** `vn-provinces.ts`: mảng `PROVINCES` 34 tên chuẩn; bảng `ALIASES` (tên cũ → tên mới theo sáp nhập 2025: Hà Giang→Tuyên Quang, Yên Bái→Lào Cai, Bắc Kạn→Thái Nguyên, Vĩnh Phúc/Hòa Bình→Phú Thọ, Bắc Giang→Bắc Ninh, Thái Bình→Hưng Yên, Hải Dương→Hải Phòng, Hà Nam/Nam Định→Ninh Bình, Quảng Bình→Quảng Trị, Quảng Nam→Đà Nẵng, Kon Tum→Quảng Ngãi, Bình Định→Gia Lai, Ninh Thuận→Khánh Hòa, Đắk Nông/Bình Thuận→Lâm Đồng, Phú Yên→Đắk Lắk, Bà Rịa - Vũng Tàu/Bình Dương→TP. Hồ Chí Minh, Bình Phước→Đồng Nai, Long An→Tây Ninh, Tiền Giang→Đồng Tháp, Bến Tre/Trà Vinh→Vĩnh Long, Sóc Trăng/Hậu Giang→Cần Thơ, Bạc Liêu→Cà Mau, Kiên Giang→An Giang); `canonicalProvince` chuẩn hoá bằng `normalizeVN` (từ `./text-normalize`), bỏ tiền tố "tinh", "thanh pho", "tp", dấu chấm, rồi tra bảng chuẩn + alias; "TP. Hồ Chí Minh" nhận cả "hồ chí minh", "hcm", "sài gòn".
- [ ] **Step 4:** Test pass. Commit: `feat: chuan hoa tinh/TP (gop tinh cu sau sap nhap 2025)`.

---

### Task 3: Chọn và xếp khách gợi ý (hàm thuần)

**Files:**
- Create: `apps/web/src/lib/trip-suggestions.ts`
- Test: `apps/web/src/lib/trip-suggestions.test.ts`

**Interfaces:**
- Consumes: Task 2 (`sameProvince`).
- Produces:
  - `interface SuggestInput { id: string; customerCode: string; customerName: string; address: string | null; province: string | null; employeeId: string | null; employeeName: string; orders12: number; lastOrderAt: string | null; lastTouchAt: string | null }` (tập con của `CustomerReportRow`)
  - `interface TripSuggestion { customerId: string; customerCode: string; customerName: string; address: string | null; employeeId: string | null; employeeName: string; daysSinceOrder: number | null; daysSinceTouch: number | null }`
  - `suggestCustomers(rows: SuggestInput[], opts: { provinces: string[]; tripEmployeeId: string; excludeNames: string[]; now?: Date }): TripSuggestion[]`

- [ ] **Step 1: Test (fail)** — các ca: đúng tỉnh (kể cả tỉnh cũ), có đơn 24 tháng (`lastOrderAt` trong 24 tháng) mới lấy, khách chưa phân được lấy (`employeeName` "(chưa phân)"), loại khách của người đi chính (`employeeId === tripEmployeeId`), loại khách trùng tên điểm dừng (`excludeNames`, so tên đã chuẩn hoá, tên điểm dừng nằm trong tên khách hoặc ngược lại), xếp chưa liên hệ lâu nhất trước (chưa từng liên hệ xếp đầu), tối đa 15, `daysSince*` tính theo ngày.
- [ ] **Step 2:** chạy test — Expected FAIL.
- [ ] **Step 3: Cài đặt** theo mô tả trên (dùng `normalizeVN`, `sameProvince`); `daysSince = Math.floor((now - date) / 86400000)`.
- [ ] **Step 4:** Test pass. Commit: `feat: chon va xep khach goi y theo tinh cua chuyen cong tac`.

---

### Task 4: API

**Files:**
- Modify: `apps/web/src/app/api/business-trips/route.ts` (POST nhận `provinces`)
- Modify: `apps/web/src/app/api/business-trips/[id]/route.ts` (action `update` nhận `provinces`)
- Create: `apps/web/src/app/api/business-trips/upcoming/route.ts`
- Create: `apps/web/src/app/api/business-trips/[id]/suggestions/route.ts`
- Test: `apps/web/src/app/api/business-trips/upcoming/route.test.ts`

**Interfaces:**
- Consumes: Task 1, 3; `buildCustomerReport` (`@/lib/customer-report`).
- Produces:
  - `GET /api/business-trips/upcoming` → `{ trips: { id, visitDate, status, provinces: string[], employee: { id, name }, stops: { companyName }[] }[] }` (mọi người dùng đăng nhập; `visitDate >= hôm nay VN`, `status != REJECTED`, sắp theo `visitDate` tăng dần).
  - `GET /api/business-trips/[id]/suggestions` → `{ suggestions: TripSuggestion[] }`.

- [ ] **Step 1:** `createSchema` thêm `provinces: z.array(z.enum(PROVINCES)).min(1, "Chọn tỉnh/TP của chuyến đi").max(5)`; POST lưu `provinces`. Action `update` ở `[id]/route.ts`: nhận `provinces` cùng schema, lưu khi có.
- [ ] **Step 2: Test route `upcoming` (fail)**: mock `prisma.businessTripRequest.findMany`; kiểm tra `where` có `visitDate: { gte }`, `status: { not: "REJECTED" }`, trả đúng trường, quyền: cần đăng nhập (SALES được xem).
- [ ] **Step 3:** Cài `upcoming/route.ts` (`requireSession`) và `[id]/suggestions/route.ts` (`requireSession`; tải chuyến và `provinces`; chuyến không có tỉnh → `suggestions: []`; gọi `buildCustomerReport({})`, rồi `suggestCustomers(rows, { provinces, tripEmployeeId: trip.employeeId, excludeNames: trip.stops.map(s => s.companyName) })`).
- [ ] **Step 4:** `npx vitest run` toàn bộ + `npx tsc --noEmit -p .` pass. Commit: `feat: API chuyen cong tac sap di va khach goi y theo tinh`.

---

### Task 5: Giao diện

**Files:**
- Modify: `apps/web/src/components/business-trips/BusinessTripsPanel.tsx` (form: ô Tỉnh/TP; hiện tỉnh ở danh sách; đặt bảng thông báo đầu trang)
- Create: `apps/web/src/components/business-trips/TripBanner.tsx`

- [ ] **Step 1:** `TripForm`: thêm state `provinces: string[]`; ô chọn nhiều tỉnh (chip bấm chọn từ `PROVINCES`, ít nhất 1), gửi `provinces` ở tạo và sửa; thiếu tỉnh thì chặn gửi và báo "Chọn tỉnh/TP của chuyến đi".
- [ ] **Step 2:** `TripBanner.tsx`: `useQuery(["business-trips","upcoming"])` gọi `/api/business-trips/upcoming`; mỗi chuyến một dòng "Ngày dd/mm · [tên] đi công tác tại [tỉnh] · Gợi ý khách"; chuyến chưa có tỉnh (cũ) chỉ hiện dòng không có nút gợi ý. Bấm mở: `useQuery(["trip-suggestions", id])` gọi `/api/business-trips/{id}/suggestions`; bảng cột Khách (kèm địa chỉ), NVKD phụ trách, Chưa mua (N ngày / "chưa mua"), Chưa liên hệ (N ngày / "chưa liên hệ"). Không có nút thao tác. Không có chuyến sắp đi thì không hiện bảng.
- [ ] **Step 3:** Đặt `<TripBanner />` ở đầu `BusinessTripsPanel`; `invalidateQueries(["business-trips"])` khi tạo/sửa/huỷ chuyến.
- [ ] **Step 4:** `npx tsc --noEmit -p .`, `npx vitest run` pass. Commit: `feat: bang thong bao chuyen cong tac sap di + khach goi y theo tinh`.

---

### Task 6: Triển khai

- [ ] Push `main`, chạy workflow deploy (tự chạy `prisma migrate deploy`), `gh run watch`; kiểm tra cột `provinces` có trên prod bằng truy vấn chỉ đọc.
