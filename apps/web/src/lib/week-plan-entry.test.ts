import { describe, expect, it } from "vitest";
import { classifyEntries, hasCountedTrip, entryCounts, isPhone, missingFields, validateNewEntry, WEEK_ENTRY_COMPLETE_FROM, type ClassifiableEntry, type EntryFields } from "./week-plan-entry";

const after = new Date("2026-10-27T03:00:00Z");
const before = new Date("2026-10-20T03:00:00Z");
const full: EntryFields = {
  entryDate: after,
  customerName: "Công ty ABC",
  address: "KCN Quế Võ, Bắc Ninh",
  nationality: "Hàn Quốc",
  scale: "50_200",
  contactName: "Chị Lan",
  contactPhone: "0912 345 678",
  need: "Tem decal 5.000 cái/tháng",
  workDone: "Gọi điện, gửi catalogue",
  nextAction: "Gửi báo giá",
  nextActionAt: new Date("2026-10-30T00:00:00Z"),
};

describe("dòng khách liên hệ mới phải đủ thông tin", () => {
  it("đủ 10 mục thì tính", () => {
    expect(missingFields(full)).toEqual([]);
    expect(entryCounts(full)).toBe(true);
  });
  it("thiếu mục nào báo đúng mục đó và không tính", () => {
    const e = { ...full, scale: null, nextActionAt: null, need: "  " };
    expect(missingFields(e)).toEqual(["quy mô", "nhu cầu", "ngày hẹn nhắc"]);
    expect(entryCounts(e)).toBe(false);
  });
  it("SĐT sai định dạng coi như thiếu", () => {
    expect(isPhone("0912 345 678")).toBe(true);
    expect(isPhone("+82 10-1234-5678")).toBe(true);
    expect(isPhone("abc")).toBe(false);
    expect(isPhone("123")).toBe(false);
    expect(missingFields({ ...full, contactPhone: "chưa có" })).toEqual(["số điện thoại"]);
  });
  it("dòng trước mốc 26/10/2026 luôn tính dù thiếu thông tin", () => {
    const old: EntryFields = { ...full, entryDate: before, address: null, nationality: null, need: null };
    expect(entryCounts(old)).toBe(true);
    expect(WEEK_ENTRY_COMPLETE_FROM.toISOString()).toBe("2026-10-25T17:00:00.000Z");
  });
});

describe("validateNewEntry", () => {
  const input = { address: "x", nationality: "Việt Nam" as const, scale: "LT50", contactName: "A", contactPhone: "0912345678", need: "n", workDone: "w", nextAction: "a", nextActionAt: "2026-10-30" };
  it("từ chối khi thiếu, nêu rõ mục thiếu", () => {
    expect(validateNewEntry(after, "Cty", { ...input, need: "" })).toBe("Chưa đủ thông tin: thiếu nhu cầu");
  });
  it("cho qua khi đủ; ngày hẹn không được trước ngày ghi", () => {
    expect(validateNewEntry(after, "Cty", input)).toBeNull();
    expect(validateNewEntry(after, "Cty", { ...input, nextActionAt: "2026-10-01" })).toBe("Ngày hẹn nhắc không được trước ngày ghi nhận");
  });
  it("dòng ghi bù cho ngày cũ không bị ép đủ", () => {
    expect(validateNewEntry(before, "Cty", {})).toBeNull();
  });
});

describe("classifyEntries — mỗi khách chỉ tính 1 lần/tháng, cho người ghi trước", () => {
  const wk = (iso: string) => new Date(`${iso}T00:00:00`);
  let n = 0;
  const mk = (over: Partial<ClassifiableEntry>): ClassifiableEntry => ({
    ...full,
    id: `e${++n}`,
    employeeId: "u1",
    metric: "NEW_CONTACT",
    weekStart: wk("2026-11-02"),
    entryDate: new Date("2026-11-03T00:00:00Z"),
    createdAt: new Date(`2026-11-03T0${n % 10}:00:00Z`),
    ...over,
  });
  const st = (m: ReturnType<typeof classifyEntries>, e: ClassifiableEntry) => m.get(e.id)?.status;

  it("ghi nhiều lần cùng khách trong tuần chỉ tính lần đầu (không phân biệt hoa/thường, dấu)", () => {
    const a = mk({ customerName: "CÔNG TY ABC" });
    const b = mk({ customerName: "cong ty abc", entryDate: new Date("2026-11-04T00:00:00Z") });
    const m = classifyEntries([b, a]);
    expect([st(m, a), st(m, b)]).toEqual(["COUNTED", "DUPLICATE"]);
  });
  it("tuần sau ghi lại khách tuần trước đã ghi thì không tính; sang tháng mới thì tính lại", () => {
    const wk1 = mk({ weekStart: wk("2026-11-02") });
    const wk2 = mk({ weekStart: wk("2026-11-09"), entryDate: new Date("2026-11-10T00:00:00Z") });
    const nextMonth = mk({ weekStart: wk("2026-12-07"), entryDate: new Date("2026-12-08T00:00:00Z") });
    const m = classifyEntries([wk1, wk2, nextMonth]);
    expect([st(m, wk1), st(m, wk2), st(m, nextMonth)]).toEqual(["COUNTED", "DUPLICATE", "COUNTED"]);
    expect(m.get(wk2.id)?.firstDate).toEqual(wk1.entryDate);
  });
  it("dòng thiếu thông tin không giữ chỗ: dòng đủ thông tin ghi sau vẫn được tính", () => {
    const bad = mk({ need: null });
    const good = mk({ entryDate: new Date("2026-11-05T00:00:00Z") });
    const m = classifyEntries([bad, good]);
    expect([st(m, bad), st(m, good)]).toEqual(["INCOMPLETE", "COUNTED"]);
  });
  it("NVKD khác ghi lại cùng khách thì không tính — khách tính cho người ghi trước", () => {
    const first = mk({ employeeId: "u1", entryDate: new Date("2026-11-03T00:00:00Z") });
    const later = mk({ employeeId: "u2", entryDate: new Date("2026-11-04T00:00:00Z") });
    const m = classifyEntries([later, first]);
    expect([st(m, first), st(m, later)]).toEqual(["COUNTED", "DUPLICATE"]);
    expect(m.get(later.id)).toMatchObject({ firstEmployeeId: "u1", firstDate: first.entryDate });
  });
  it("khác mục thì tính riêng", () => {
    const a = mk({});
    const otherMetric = mk({ metric: "NEW_MEETING" });
    const m = classifyEntries([a, otherMetric]);
    expect([st(m, a), st(m, otherMetric)]).toEqual(["COUNTED", "COUNTED"]);
  });
  it("dòng cũ trước 26/10/2026 giữ nguyên (vẫn tính), nhưng dòng mới sau đó trùng khách thì không tính", () => {
    const old1 = mk({ weekStart: wk("2026-10-19"), entryDate: new Date("2026-10-20T00:00:00Z"), need: null });
    const old2 = mk({ weekStart: wk("2026-10-19"), entryDate: new Date("2026-10-21T00:00:00Z") });
    const fresh = mk({ weekStart: wk("2026-10-26"), entryDate: new Date("2026-10-27T00:00:00Z") });
    const m = classifyEntries([old1, old2, fresh]);
    expect([st(m, old1), st(m, old2), st(m, fresh)]).toEqual(["COUNTED", "COUNTED", "DUPLICATE"]);
  });
});

describe("KH mới hẹn gặp được — phải có đăng ký công tác đã duyệt (anh Quân chốt 31/10/2026)", () => {
  const weekStart = new Date(2026, 10, 2);
  let t = 0;
  const mk = (over: Partial<ClassifiableEntry>): ClassifiableEntry => ({
    ...full,
    id: `t${++t}`,
    employeeId: "u1",
    metric: "NEW_MEETING",
    weekStart,
    entryDate: new Date("2026-11-03T00:00:00Z"),
    createdAt: new Date(`2026-11-03T0${t % 10}:00:00Z`),
    ...over,
  });
  const st = (m: ReturnType<typeof classifyEntries>, e: ClassifiableEntry) => m.get(e.id)?.status;

  it("chưa có điểm dừng công tác khớp thì NO_TRIP, có thì COUNTED", () => {
    const no = mk({ customerName: "Cty A", tripOk: false });
    const yes = mk({ customerName: "Cty B", tripOk: true });
    const m = classifyEntries([no, yes]);
    expect([st(m, no), st(m, yes)]).toEqual(["NO_TRIP", "COUNTED"]);
  });
  it("dòng NO_TRIP không giữ chỗ: dòng có đăng ký công tác ghi sau vẫn được tính", () => {
    const no = mk({ tripOk: false });
    const yes = mk({ entryDate: new Date("2026-11-04T00:00:00Z"), tripOk: true });
    const m = classifyEntries([no, yes]);
    expect([st(m, no), st(m, yes)]).toEqual(["NO_TRIP", "COUNTED"]);
  });
  it("dòng trước 26/10/2026 và mục khác (NEW_CONTACT) không bị xét đăng ký công tác", () => {
    const old = mk({ entryDate: new Date("2026-10-20T00:00:00Z"), weekStart: new Date(2026, 9, 19), tripOk: false });
    const contact = mk({ metric: "NEW_CONTACT", tripOk: false });
    const m = classifyEntries([old, contact]);
    expect([st(m, old), st(m, contact)]).toEqual(["COUNTED", "COUNTED"]);
  });
});

describe("hasCountedTrip", () => {
  const stops = [
    { employeeId: "u1", visitDate: new Date("2026-10-13T00:00:00+07:00"), companyName: "Khóa Việt - Tiệp" },
    { employeeId: "u2", visitDate: new Date("2026-10-13T00:00:00+07:00"), companyName: "Rise" },
  ];
  const e = (over: object) => ({ employeeId: "u1", customerName: "Công ty Cổ phần Khóa Việt - Tiệp", entryDate: new Date("2026-10-11T00:00:00+07:00"), ...over });
  it("cùng NVKD, tên điểm dừng nằm trong tên khách, ngày đi >= ngày ghi", () => {
    expect(hasCountedTrip(e({}), stops)).toBe(true);
  });
  it("khác NVKD, khác công ty hoặc đi trước ngày ghi thì không khớp", () => {
    expect(hasCountedTrip(e({ employeeId: "u3" }), stops)).toBe(false);
    expect(hasCountedTrip(e({ customerName: "CÔNG TY RISE VIỆT NAM" }), stops)).toBe(false); // Rise là của u2
    expect(hasCountedTrip(e({ entryDate: new Date("2026-10-14T00:00:00+07:00") }), stops)).toBe(false);
  });
});

describe("classifyEntries — chỉ tính khách mới (chưa từng mua hoặc ngừng mua ≥ 1 năm)", () => {
  const weekStart = new Date(2026, 10, 2);
  let k = 0;
  const mk = (over: Partial<ClassifiableEntry>): ClassifiableEntry => ({
    ...full,
    id: `x${++k}`,
    employeeId: "u1",
    metric: "NEW_CONTACT",
    weekStart,
    entryDate: new Date("2026-11-03T00:00:00Z"),
    createdAt: new Date(`2026-11-03T0${k % 10}:00:00Z`),
    ...over,
  });
  it("khách đang mua (đơn gần nhất trong vòng 1 năm) không tính và không giữ chỗ", () => {
    const existing = mk({ lastOrderDate: new Date("2026-08-15T00:00:00Z"), lastOrderCustomer: "CÔNG TY TNHH ABC" });
    const m = classifyEntries([existing]);
    expect(m.get(existing.id)).toMatchObject({ status: "EXISTING", lastOrderCustomer: "CÔNG TY TNHH ABC" });
  });
  it("khách ngừng mua từ 1 năm trở lên hoặc chưa từng mua thì tính", () => {
    const stopped = mk({ customerName: "Cty Cũ", lastOrderDate: new Date("2025-10-01T00:00:00Z") });
    const never = mk({ customerName: "Cty Mới", lastOrderDate: null });
    const m = classifyEntries([stopped, never]);
    expect([m.get(stopped.id)?.status, m.get(never.id)?.status]).toEqual(["COUNTED", "COUNTED"]);
  });
  it("dòng cũ được tính lại khi cờ checkExisting bật (tuần 19–25/10 của anh Tùng)", () => {
    const old = mk({ entryDate: new Date("2026-10-20T00:00:00Z"), weekStart: new Date(2026, 9, 19), lastOrderDate: new Date("2026-09-01T00:00:00Z"), checkExisting: true });
    expect(classifyEntries([old]).get(old.id)?.status).toBe("EXISTING");
  });
  it("dòng cũ trước 26/10/2026 không bị loại dù là khách cũ", () => {
    const old = mk({ entryDate: new Date("2026-10-20T00:00:00Z"), weekStart: new Date(2026, 9, 19), lastOrderDate: new Date("2026-09-01T00:00:00Z") });
    expect(classifyEntries([old]).get(old.id)?.status).toBe("COUNTED");
  });
});
