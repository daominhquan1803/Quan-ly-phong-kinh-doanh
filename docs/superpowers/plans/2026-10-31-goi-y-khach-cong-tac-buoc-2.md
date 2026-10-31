# Gợi ý khách khi đăng ký công tác — Bước 2: người đi gặp / người hỗ trợ theo điểm dừng và điểm gặp khách mới

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi khách trong form đăng ký công tác có NVKD đi gặp và người hỗ trợ riêng; điểm gặp khách của điểm dừng mới tính riêng cho người đi gặp và từng người hỗ trợ của điểm dừng đó.

**Architecture:** Điểm dừng cũ (`attendeeId` null) giữ nguyên đường tính hiện có (hằng `COUNTED_STOP_WHERE` thêm điều kiện `attendeeId: null`). Điểm dừng mới (`attendeeId` có giá trị) tính qua hàm mới `loadStopCredits` (đã duyệt chuyến + điểm dừng có kết quả "gặp được"), cộng thêm vào 4 nơi: KPI tháng, báo cáo, kế hoạch tuần, kiểm tra "KH mới hẹn gặp được". Chăm sóc khách (lần gặp) dùng cả hai loại điểm dừng.

**Tech Stack:** Next.js 14, Prisma/Postgres, zod, vitest, React Query.

**Spec:** `docs/superpowers/specs/2026-10-31-goi-y-khach-cong-tac-design.md` (bước 2).

## Global Constraints

- Điểm gặp khách: mỗi điểm dừng mới cộng 1 cho người đi gặp và 1 cho mỗi người hỗ trợ của điểm dừng đó; người đi gặp không là người hỗ trợ trừ khi được thêm.
- Điểm dừng mới chỉ tính khi chuyến `APPROVED` và điểm dừng có `outcome = MET` (báo cáo của chính điểm dừng).
- Điểm dừng cũ và chuyến cũ tính như hiện nay, kết quả KPI/điểm tuần đã chốt không đổi.
- Người đăng ký có thể đăng ký cho NVKD khác; người được chọn chỉ nhận thông báo, không cần xác nhận.
- Chuyến mới: người hỗ trợ cấp chuyến (`supporterEmployeeIds`) không còn dùng ở form; API vẫn nhận nhưng chỉ áp cho điểm dừng cũ (không có người đi gặp).
- NVKD đi gặp mặc định là người phụ trách khách đã chọn, nếu không có thì là người đăng ký.

---

### Task 1: Schema và migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`BusinessTripStop`, `Customer`, `User`, `NotificationType`)
- Create: `packages/db/prisma/migrations/20261031180000_trip_stop_attendee/migration.sql`

- [ ] `BusinessTripStop` thêm `customerId String?` (quan hệ `Customer`, `onDelete: SetNull`), `attendeeId String?` (quan hệ `User` "TripStopAttendee"), `addedById String?` (quan hệ `User` "TripStopAddedBy"), `supporters BusinessTripStopSupporter[]`.
- [ ] Model mới `BusinessTripStopSupporter` (`id`, `stopId` cascade, `employeeId` → `User` "TripStopSupporter", `@@unique([stopId, employeeId])`, `@@index([employeeId])`, `@@map("business_trip_stop_supporters")`).
- [ ] Back-relations ở `Customer` (`tripStops`) và `User` (`tripStopsAttended`, `tripStopsAdded`, `tripStopSupports`).
- [ ] `NotificationType` thêm `TRIP_ASSIGNED`.
- [ ] Migration SQL: `ALTER TYPE "NotificationType" ADD VALUE 'TRIP_ASSIGNED';` + `ALTER TABLE business_trip_stops ADD COLUMN customerId/attendeeId/addedById TEXT` + 3 FK + `CREATE TABLE business_trip_stop_supporters` + unique/index + FK.
- [ ] `npm run generate --workspace=packages/db` và `npm run build --workspace=packages/db`.

### Task 2: Hàm điểm gặp khách mới (thuần + tải dữ liệu)

**Files:**
- Modify: `apps/web/src/lib/business-trip-report.ts` (hằng số)
- Create: `apps/web/src/lib/trip-credit.ts`
- Test: `apps/web/src/lib/trip-credit.test.ts`

**Interfaces:**
- Produces: `COUNTED_STOP_WHERE` (thêm `attendeeId: null`), `COUNTED_NEW_STOP_WHERE = { attendeeId: { not: null }, outcome: "MET" }`, `COUNTED_ANY_STOP_WHERE = { OR: [COUNTED_STOP_WHERE, COUNTED_NEW_STOP_WHERE] }`; `interface StopCredit { employeeId: string; visitDate: Date; stopId: string; companyName: string; content: string }`; `creditsOfStops(stops, employeeIds?)` (thuần); `loadStopCredits({ start, end, employeeIds? }): Promise<StopCredit[]>`.

- [ ] Test (fail trước): ví dụ Tùng/Dung — chuyến 2 điểm dừng, điểm 1 người đi gặp Tùng, điểm 2 người đi gặp Dung và người hỗ trợ Tùng → Tùng 2 tín dụng, Dung 1; người hỗ trợ cả 2 điểm được 2; lọc theo `employeeIds`; không trùng người trong cùng điểm dừng (người đi gặp cũng nằm trong hỗ trợ chỉ tính 1).
- [ ] Cài đặt `creditsOfStops` và `loadStopCredits` (truy vấn `businessTripStop` với `COUNTED_NEW_STOP_WHERE`, `trip: { status: "APPROVED", visitDate: { gte, lt } }`, chọn `supporters`).

### Task 3: Nối vào các nơi tính điểm

**Files:** `kpi-metrics.ts`, `report-metrics.ts`, `week-plan.ts`, `customer-care-plan.ts` và test mock của chúng.

- [ ] `kpi-metrics.ts`: thêm `loadStopCredits` cho tháng, cộng 1 vào `visitByEmployee` cho mỗi tín dụng.
- [ ] `report-metrics.ts`: mỗi tín dụng gọi `addTrip(employeeId, visitDate, 1)` (số khách và số ngày).
- [ ] `week-plan.ts`: (a) EXISTING_VISIT — `addVisitCompany(employeeId, companyName)` cho mỗi tín dụng trong tuần; (b) BUSINESS_TRIP — `addDate(employeeId, visitDate)`; (c) kiểm tra "KH mới hẹn gặp được" — thêm `tripStops` cho mỗi tín dụng; (d) chi tiết tuần — thêm các điểm dừng tín dụng của NVKD vào `trips` (vai trò "Đi gặp" hoặc "Hỗ trợ").
- [ ] `customer-care-plan.ts`: truy vấn điểm dừng dùng `COUNTED_ANY_STOP_WHERE` và `trip: { status: "APPROVED" }`.
- [ ] Sửa các test mock để `businessTripStop.findMany` trả `[]` khi `where.attendeeId` có mặt.

### Task 4: API đăng ký

**Files:** `lib/business-trip-schema.ts`, `app/api/business-trips/route.ts`, `app/api/business-trips/[id]/route.ts`, test.

- [ ] `stopSchema` thêm `customerId`, `attendeeId`, `supporterEmployeeIds` (tuỳ chọn).
- [ ] POST và `update`: với mỗi điểm dừng, `attendeeId` = giá trị chọn (phải là NVKD đang hoạt động) hoặc mặc định `ownerId`; lưu `customerId`, `addedById = session.user.id`, người hỗ trợ điểm dừng (đang hoạt động, loại người trùng với người đi gặp không cần — vẫn lưu nếu người đăng ký chọn).
- [ ] Thông báo `TRIP_ASSIGNED` cho người đi gặp và người hỗ trợ khác người đăng ký (gộp mỗi người một thông báo mỗi chuyến, liệt kê khách).
- [ ] `GET /api/business-trips`: NVKD thấy thêm chuyến mình là người đi gặp hoặc người hỗ trợ của điểm dừng; kết quả trả thêm `attendee`, `supporters`, `customerId` trên từng điểm dừng.
- [ ] Test: tạo chuyến có người đi gặp khác (Dung) và người hỗ trợ (Tùng) lưu đúng; mặc định người đi gặp = người đăng ký; người đi gặp không hợp lệ -> 400; thông báo gửi đúng người.

### Task 5: Form và danh sách

**Files:** `components/business-trips/BusinessTripsPanel.tsx`, `types.ts`.

- [ ] Mỗi khách: ô tên có gợi ý khách (datalist từ danh sách khách; chọn khách thì điền địa chỉ nếu trống, đặt người đi gặp = người phụ trách), ô "NVKD đi gặp" (mặc định như trên), chip "Người hỗ trợ". Bỏ ô người hỗ trợ cấp chuyến ở form.
- [ ] Danh sách hiện người đi gặp và người hỗ trợ cạnh mỗi điểm dừng.

### Task 6: Kiểm tra và triển khai

- [ ] `npx tsc --noEmit -p .`, `npx vitest run` pass; commit; push; deploy; kiểm tra bảng `business_trip_stop_supporters` có trên prod.
