/**
 * Sửa dữ liệu 1 lần: các dòng kết quả Kế hoạch tuần nhập từ file Excel (WeekPlanResultEntry có
 * importBatchId) bị đảo ngày/tháng (xem fixSwappedDayMonth trong packages/db/src/swapped-date.ts —
 * bug thật phát hiện 19/09/2026: "3/9" bị lưu thành 09/03 nên chỉ ngày 09/09 rơi vào Tuần 1).
 *
 * Bước 1: dòng nào đảo được (theo thời điểm tải file) thì sửa entryDate + tính lại weekStart.
 * Bước 2: gộp trùng — NVKD tải cùng 1 file 2 lần (lần đầu không thấy dòng nên tải lại) khiến
 *   cùng khách/cùng ngày/cùng mục bị ghi 2 lần, sau khi sửa ngày sẽ thành đếm đôi. Trong nhóm
 *   trùng (cùng nhân viên + mục + ngày + tên khách chuẩn hoá, chỉ xét dòng nhập từ file) giữ dòng
 *   tạo sớm nhất, xoá các dòng còn lại. KHÔNG đụng dòng nhập tay (importBatchId = null).
 *
 * Chạy với TZ=Asia/Ho_Chi_Minh (ngày lưu là nửa đêm giờ Việt Nam): xem script tự kiểm tra bên dưới.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/repair-week-plan-swapped-dates.ts [--dry-run]
 */
import { prisma, fixSwappedDayMonth } from "@hoanggia/db";

// Bản chép của findMonthWeekForDate (apps/web/src/lib/week-plan.ts) — script không import được
// code của apps/web. 4 tuần/tháng: Tuần 1 = [ngày 1, M2-1], Tuần 2 = [M2, M3-1], Tuần 3 = [M3, M4-1],
// Tuần 4 = [M4, cuối tháng], M2/M3/M4 = thứ Hai thứ 2/3/4 tính từ thứ Hai đầu tiên trên/sau ngày 1.
function weekStartFor(d: Date): Date {
  const y = d.getFullYear();
  const mo = d.getMonth();
  const monthStart = new Date(y, mo, 1);
  const dow = monthStart.getDay();
  const m1 = new Date(y, mo, 1 + (dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow));
  const m2 = new Date(y, mo, m1.getDate() + 7);
  const m3 = new Date(y, mo, m1.getDate() + 14);
  const m4 = new Date(y, mo, m1.getDate() + 21);
  const day = new Date(y, mo, d.getDate()).getTime();
  if (day >= m4.getTime()) return m4;
  if (day >= m3.getTime()) return m3;
  if (day >= m2.getTime()) return m2;
  return monthStart;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (new Date(2026, 8, 9).getTimezoneOffset() !== -420) {
    throw new Error("Phải chạy với TZ=Asia/Ho_Chi_Minh (múi giờ hiện tại sai) — dừng để tránh sửa nhầm ngày.");
  }

  const entries = await prisma.weekPlanResultEntry.findMany({
    where: { importBatchId: { not: null } },
    include: { importBatch: { select: { createdAt: true, fileName: true } }, employee: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Tổng ${entries.length} dòng nhập từ file.`);

  type Row = { id: string; employeeId: string; employeeName: string; metric: string; date: Date; weekStart: Date; customerName: string; createdAt: Date; changedFrom: Date | null };
  const rows: Row[] = entries.map((e) => {
    const fix = fixSwappedDayMonth(e.entryDate, e.importBatch!.createdAt);
    return {
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee.name,
      metric: e.metric,
      date: fix.date,
      weekStart: fix.swapped ? weekStartFor(fix.date) : e.weekStart,
      customerName: e.customerName,
      createdAt: e.createdAt,
      changedFrom: fix.swapped ? e.entryDate : null,
    };
  });

  const toUpdate = rows.filter((r) => r.changedFrom);
  console.log(`\nBước 1 — sửa ngày đảo: ${toUpdate.length} dòng.`);
  const byPair = new Map<string, number>();
  for (const r of toUpdate) {
    const k = `${r.employeeName}: ${ymd(r.changedFrom!)} -> ${ymd(r.date)}`;
    byPair.set(k, (byPair.get(k) ?? 0) + 1);
  }
  for (const [k, n] of byPair) console.log(`  ${k}: ${n} dòng`);

  // Bước 2: gộp trùng SAU khi đã sửa ngày (giữ dòng tạo sớm nhất; rows đã sắp xếp theo createdAt).
  const seen = new Map<string, string>();
  const toDelete: Row[] = [];
  for (const r of rows) {
    const key = [r.employeeId, r.metric, ymd(r.date), norm(r.customerName)].join("|");
    if (seen.has(key)) toDelete.push(r);
    else seen.set(key, r.id);
  }
  console.log(`\nBước 2 — xoá dòng trùng: ${toDelete.length} dòng.`);
  for (const r of toDelete.slice(0, 15)) console.log(`  - ${r.employeeName} | ${r.metric} | ${ymd(r.date)} | ${r.customerName}`);

  if (dryRun) {
    console.log("\n=== DRY RUN — chưa sửa/xoá gì ===");
    return;
  }

  const deleteIds = new Set(toDelete.map((r) => r.id));
  for (const r of toUpdate) {
    if (deleteIds.has(r.id)) continue; // sắp xoá — khỏi sửa
    await prisma.weekPlanResultEntry.update({ where: { id: r.id }, data: { entryDate: r.date, weekStart: r.weekStart } });
  }
  if (deleteIds.size > 0) await prisma.weekPlanResultEntry.deleteMany({ where: { id: { in: Array.from(deleteIds) } } });
  console.log(`\n=== ĐÃ SỬA ${toUpdate.filter((r) => !deleteIds.has(r.id)).length} dòng, XOÁ ${deleteIds.size} dòng trùng ===`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
