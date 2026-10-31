import { prisma } from "@hoanggia/db";
import { COUNTED_NEW_STOP_WHERE } from "./business-trip-report";

/**
 * Điểm gặp khách của điểm dừng CÓ người đi gặp riêng (anh Quân chốt 31/10/2026): mỗi điểm dừng cộng 1 điểm cho người đi gặp và
 * 1 điểm cho mỗi người hỗ trợ CỦA ĐIỂM DỪNG ĐÓ (không chia chung cả chuyến). Chỉ tính khi chuyến đã duyệt và điểm dừng có báo cáo
 * "gặp được". Điểm dừng cũ (không có người đi gặp) vẫn tính theo đường cũ (COUNTED_TRIP_WHERE / COUNTED_STOP_WHERE).
 */
export interface StopCredit {
  employeeId: string;
  visitDate: Date;
  stopId: string;
  companyName: string;
  content: string;
}

interface CreditStopInput {
  id: string;
  companyName: string;
  content: string;
  attendeeId: string | null;
  supporters: { employeeId: string }[];
  trip: { visitDate: Date };
}

/** Thuần: từ các điểm dừng đã đủ điều kiện, trả mỗi (người, điểm dừng) 1 tín dụng; có thể lọc theo danh sách nhân viên. */
export function creditsOfStops(stops: CreditStopInput[], employeeIds?: string[]): StopCredit[] {
  const only = employeeIds ? new Set(employeeIds) : null;
  const out: StopCredit[] = [];
  for (const s of stops) {
    const people = new Set<string>();
    if (s.attendeeId) people.add(s.attendeeId);
    for (const p of s.supporters) people.add(p.employeeId);
    for (const employeeId of people) {
      if (only && !only.has(employeeId)) continue;
      out.push({ employeeId, visitDate: s.trip.visitDate, stopId: s.id, companyName: s.companyName, content: s.content });
    }
  }
  return out;
}

/** Tín dụng gặp khách của các điểm dừng mới (có người đi gặp) trong [start, end). */
export async function loadStopCredits(opts: { start: Date; end: Date; employeeIds?: string[] }): Promise<StopCredit[]> {
  const stops = await prisma.businessTripStop.findMany({
    where: { ...COUNTED_NEW_STOP_WHERE, trip: { status: "APPROVED", visitDate: { gte: opts.start, lt: opts.end } } },
    select: {
      id: true,
      companyName: true,
      content: true,
      attendeeId: true,
      supporters: { select: { employeeId: true } },
      trip: { select: { visitDate: true } },
    },
  });
  return creditsOfStops(stops, opts.employeeIds);
}
