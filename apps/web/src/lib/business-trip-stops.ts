import { prisma } from "@hoanggia/db";
import { z } from "zod";
import { stopSchema } from "./business-trip-schema";
import { notifyUser } from "./business-trip-notify";

type StopInput = z.infer<typeof stopSchema>;

export interface ResolvedStop {
  orderIndex: number;
  companyName: string;
  address: string | null;
  expectedTime: string | null;
  content: string;
  customerId: string | null;
  /** NVKD đi gặp điểm dừng này (mặc định = người đăng ký) */
  attendeeId: string;
  /** Người hỗ trợ của riêng điểm dừng này */
  supporterIds: string[];
  addedById: string;
}

/**
 * Chuẩn hoá điểm dừng khi đăng ký/sửa chuyến (anh Quân chốt 31/10/2026): mỗi điểm dừng có NVKD đi gặp (mặc định người đăng ký) và
 * người hỗ trợ riêng; người được chọn phải là nhân viên đang hoạt động, khách (nếu chọn từ danh sách) phải có thật.
 */
export async function resolveStops(stops: StopInput[], ownerId: string, addedById: string): Promise<{ stops: ResolvedStop[] } | { error: string }> {
  const personIds = new Set<string>();
  const customerIds = new Set<string>();
  for (const s of stops) {
    if (s.attendeeId) personIds.add(s.attendeeId);
    for (const id of s.supporterEmployeeIds ?? []) personIds.add(id);
    if (s.customerId) customerIds.add(s.customerId);
  }
  const [people, customers] = await Promise.all([
    personIds.size ? prisma.user.findMany({ where: { id: { in: Array.from(personIds) }, active: true }, select: { id: true } }) : Promise.resolve([]),
    customerIds.size ? prisma.customer.findMany({ where: { id: { in: Array.from(customerIds) } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  const okPeople = new Set(people.map((p) => p.id));
  const okCustomers = new Set(customers.map((c) => c.id));
  const out: ResolvedStop[] = [];
  for (const [i, s] of stops.entries()) {
    if (s.attendeeId && !okPeople.has(s.attendeeId)) return { error: `Điểm dừng ${i + 1}: NVKD đi gặp không hợp lệ` };
    const supporterIds = Array.from(new Set(s.supporterEmployeeIds ?? []));
    if (supporterIds.some((id) => !okPeople.has(id))) return { error: `Điểm dừng ${i + 1}: người hỗ trợ không hợp lệ` };
    if (s.customerId && !okCustomers.has(s.customerId)) return { error: `Điểm dừng ${i + 1}: khách hàng không hợp lệ` };
    out.push({
      orderIndex: i + 1,
      companyName: s.companyName.trim(),
      address: s.address?.trim() || null,
      expectedTime: s.expectedTime?.trim() || null,
      content: s.content.trim(),
      customerId: s.customerId || null,
      attendeeId: s.attendeeId || ownerId,
      supporterIds,
      addedById,
    });
  }
  return { stops: out };
}

/** Prisma `stops.create` cho các điểm dừng đã chuẩn hoá. */
export const stopsCreateData = (stops: ResolvedStop[]) =>
  stops.map((s) => ({
    orderIndex: s.orderIndex,
    companyName: s.companyName,
    address: s.address,
    expectedTime: s.expectedTime,
    content: s.content,
    customerId: s.customerId,
    attendeeId: s.attendeeId,
    addedById: s.addedById,
    supporters: { create: s.supporterIds.map((employeeId) => ({ employeeId })) },
  }));

/** Ai đi gặp / hỗ trợ khách nào: người -> { gặp: [khách], hỗ trợ: [khách] } (bỏ người thực hiện đăng ký). */
export function assignmentsByPerson(stops: Pick<ResolvedStop, "companyName" | "attendeeId" | "supporterIds">[], exceptUserId: string) {
  const by = new Map<string, { meet: string[]; support: string[] }>();
  const slot = (id: string) => by.get(id) ?? by.set(id, { meet: [], support: [] }).get(id)!;
  for (const s of stops) {
    if (s.attendeeId !== exceptUserId) slot(s.attendeeId).meet.push(s.companyName);
    for (const id of s.supporterIds) if (id !== exceptUserId && id !== s.attendeeId) slot(id).support.push(s.companyName);
  }
  return by;
}

/** Báo cho NVKD được chọn đi gặp / hỗ trợ (chỉ thông báo, không cần xác nhận) — mỗi người 1 thông báo cho mỗi chuyến. */
export async function notifyAssigned(opts: { stops: ResolvedStop[]; registrantId: string; registrantName: string; visitDate: Date }) {
  const day = new Date(opts.visitDate.getTime() + 7 * 3600_000).toISOString().slice(8, 10) + "/" + new Date(opts.visitDate.getTime() + 7 * 3600_000).toISOString().slice(5, 7);
  for (const [userId, a] of assignmentsByPerson(opts.stops, opts.registrantId)) {
    const parts = [a.meet.length ? `bạn đi gặp ${a.meet.join(", ")}` : null, a.support.length ? `bạn hỗ trợ ${a.support.join(", ")}` : null].filter(Boolean);
    await notifyUser(userId, {
      type: "TRIP_ASSIGNED",
      title: "Bạn được xếp vào chuyến công tác",
      message: `${opts.registrantName} đăng ký công tác ngày ${day}: ${parts.join("; ")}.`,
      link: "/business-trips",
    });
  }
}
