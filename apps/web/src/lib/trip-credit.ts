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
  /** Điểm của tín dụng này: 1, hoặc 0,5 cho người hỗ trợ đã có khách riêng trong cùng chuyến (từ SUPPORT_HALF_FROM). */
  weight: number;
}

interface CreditStopInput {
  id: string;
  companyName: string;
  content: string;
  attendeeId: string | null;
  supporters: { employeeId: string }[];
  trip: { id?: string; visitDate: Date };
}

/**
 * Luật người hỗ trợ (anh Quân chốt 11/11/2026, áp dụng từ 1/11/2026): hỗ trợ mà trong chuyến KHÔNG có khách của mình (không đi gặp
 * điểm dừng nào của chuyến) = 1 điểm mỗi điểm dừng; hỗ trợ mà trong chuyến CÓ khách của mình = 0,5 điểm mỗi điểm dừng hỗ trợ.
 * Người đi gặp luôn 1 điểm. Chuyến trước 1/11/2026 giữ luật cũ (hỗ trợ 1 điểm).
 */
export const SUPPORT_HALF_FROM = new Date("2026-11-01T00:00:00+07:00");
export const SUPPORT_HALF_WEIGHT = 0.5;

/** Thuần: từ các điểm dừng đã đủ điều kiện, trả mỗi (người, điểm dừng) 1 tín dụng; có thể lọc theo danh sách nhân viên. */
export function creditsOfStops(
  stops: CreditStopInput[],
  employeeIds?: string[],
  /** Người đi gặp của MỌI điểm dừng trong chuyến (kể cả điểm dừng chưa báo "gặp được") — vẫn là "có khách của mình trong chuyến". */
  tripAttendees: { tripId: string; attendeeId: string }[] = []
): StopCredit[] {
  const only = employeeIds ? new Set(employeeIds) : null;
  // Người đi gặp (có khách riêng) của từng chuyến — tính trên toàn bộ điểm dừng của chuyến, không phụ thuộc bộ lọc nhân viên.
  const attendeesByTrip = new Map<string, Set<string>>();
  const addAttendee = (tripKey: string, id: string) => {
    if (!attendeesByTrip.has(tripKey)) attendeesByTrip.set(tripKey, new Set());
    attendeesByTrip.get(tripKey)!.add(id);
  };
  for (const s of stops) if (s.attendeeId) addAttendee(s.trip.id ?? "", s.attendeeId);
  for (const a of tripAttendees) addAttendee(a.tripId, a.attendeeId);
  const out: StopCredit[] = [];
  for (const s of stops) {
    const people = new Set<string>(s.supporters.map((p) => p.employeeId));
    if (s.attendeeId) people.add(s.attendeeId);
    for (const employeeId of people) {
      if (only && !only.has(employeeId)) continue;
      const isSupportOnly = employeeId !== s.attendeeId;
      const hasOwnCustomer = attendeesByTrip.get(s.trip.id ?? "")?.has(employeeId) ?? false;
      const weight = isSupportOnly && hasOwnCustomer && s.trip.visitDate >= SUPPORT_HALF_FROM ? SUPPORT_HALF_WEIGHT : 1;
      out.push({ employeeId, visitDate: s.trip.visitDate, stopId: s.id, companyName: s.companyName, content: s.content, weight });
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
      trip: { select: { id: true, visitDate: true } },
    },
  });
  const tripIds = Array.from(new Set(stops.map((s) => s.trip.id)));
  const tripAttendees = tripIds.length
    ? await prisma.businessTripStop.findMany({
        where: { tripId: { in: tripIds }, attendeeId: { not: null } },
        select: { tripId: true, attendeeId: true },
      })
    : [];
  return creditsOfStops(
    stops,
    opts.employeeIds,
    tripAttendees.flatMap((a) => (a.attendeeId ? [{ tripId: a.tripId, attendeeId: a.attendeeId }] : []))
  );
}
