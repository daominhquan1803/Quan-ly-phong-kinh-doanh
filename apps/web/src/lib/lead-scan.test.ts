import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseLeadWorkbook,
  buildEmployeeResolver,
  buildLeadReport,
  classifyResult,
  ownerFromSheetName,
  parseFacebookRows,
  parseLogRows,
  parseScanProspectRows,
  parseSelfRows,
  parseSheetDate,
  periodOf,
} from "./lead-scan";

const users = [
  { id: "u-dung", name: "Phạm Thị Dung" },
  { id: "u-tung", name: "Ngô Thanh Tùng" },
  { id: "u-tan", name: "Đặng Văn Tấn" },
  { id: "u-quan", name: "Đào Minh Quân" },
];
const resolve = buildEmployeeResolver(users);

describe("parseSheetDate", () => {
  it("nhận các dạng ngày trong sheet", () => {
    expect(parseSheetDate("2/11/2026", 2026)).toBe("2026-11-02");
    expect(parseSheetDate("09/11/2026", 2026)).toBe("2026-11-09");
    expect(parseSheetDate("2026-10-23", 2026)).toBe("2026-10-23");
    expect(parseSheetDate("14/11", 2026)).toBe("2026-11-14");
    expect(parseSheetDate(46000, 2026)).toBe("2025-12-09"); // serial Excel
  });
  it("ngày sai / rỗng -> null", () => {
    expect(parseSheetDate("", 2026)).toBeNull();
    expect(parseSheetDate("31/02/2026", 2026)).toBeNull();
    expect(parseSheetDate("abc", 2026)).toBeNull();
    expect(parseSheetDate("​", 2026)).toBeNull();
  });
});

describe("classifyResult", () => {
  it("không phản hồi / không liên lạc được", () => {
    for (const t of ["Khách không phản hồi", "KNM", "Gọi chưa kết nối được", "SĐT k đúng", "Nhóm kín, k click vào đc", "Chưa liên hệ được", "Đã để lại thông tin Messenger. SĐT không phải của người cần mua hàng"])
      expect(classifyResult(t)).toBe("NO_RESPONSE");
  });
  it("liên hệ được (khách có trao đổi)", () => {
    for (const t of ["Đã gửi báo giá", "Quan tâm, hẹn gọi lại", "đang khai thác", "Đã có NCC, từ chối", "KH hỏi giấy sóng E , đã gọi đt trao đổi"]) expect(classifyResult(t)).toBe("REACHED");
  });
  it("đã nhắn / để lại thông tin: chờ khách, chưa tính là liên hệ được", () => {
    for (const t of ["Khách dùng nick ẩn danh, đã để lại TTLH trên bài đăng", "Đã nt Mess đợi khách phản hồi", "KB Zalo xin thông tin"]) expect(classifyResult(t)).toBe("WAITING");
  });
  it("khác / rỗng", () => {
    expect(classifyResult("đã liên hệ")).toBe("OTHER");
    expect(classifyResult("")).toBeNull();
    expect(classifyResult(null)).toBeNull();
  });
});

describe("buildEmployeeResolver / ownerFromSheetName", () => {
  it("khớp tên gọi, tên đầy đủ, tiền tố Mr; mơ hồ hoặc lạ thì null", () => {
    expect(resolve("Dung")).toBe("u-dung");
    expect(resolve("Tùng")).toBe("u-tung");
    expect(resolve("Mr Tấn")).toBe("u-tan");
    expect(resolve("Đào Minh Quân")).toBe("u-quan");
    expect(resolve("Lan")).toBeNull();
    expect(resolve("")).toBeNull();
  });
  it("bí danh được ưu tiên", () => {
    const r = buildEmployeeResolver(users, [{ aliasName: "Anh Dũng", employeeId: "u-tan" }]);
    expect(r("anh dung")).toBe("u-tan");
  });
  it("chủ tab tự tìm", () => {
    expect(ownerFromSheetName("Mr Tùng tự tìm")).toBe("tung");
    expect(ownerFromSheetName("PT.DUNG")).toBe("dung");
  });
});

const FB_HEAD = ["STT", "Ngày quét", "Ngày đăng", "Nền tảng", "Nhóm / trang", "Người đăng", "Sản phẩm cần", "Số lượng / quy cách", "Khu vực", "Liên hệ trong bài", "Link bài", "Ngày liên hệ", "NVKD nhận", "Kết quả", "Ghi chú"];
const fbRow = (o: { stt: number; scan?: string; link?: string; contact?: string; nv?: string; kq?: string; note?: string }) => [
  o.stt, o.scan ?? "07/10/2026", "06/10/2026", "Facebook", "Nhóm A", "Anh B", "Hộp", "100", "Hà Nội", "Inbox", o.link ?? `https://fb/${o.stt}`, o.contact ?? "", o.nv ?? "", o.kq ?? "", o.note ?? "",
];

describe("parseFacebookRows — kết quả liên hệ phải đầy đủ mới ghi nhận", () => {
  const rows = [
    FB_HEAD,
    fbRow({ stt: 1 }), // chưa giao
    fbRow({ stt: 2, nv: "Dung" }), // đã giao, chưa liên hệ
    fbRow({ stt: 3, nv: "Dung", contact: "7/10/2026", kq: "Khách không phản hồi", note: "Đã nt Mess" }), // đủ, không phản hồi
    fbRow({ stt: 4, nv: "Tùng", contact: "8/10/2026", kq: "Đã gửi báo giá" }), // đủ, liên hệ được
    fbRow({ stt: 5, nv: "Dung", kq: "Khách dùng nick ẩn danh, đã để lại TTLH" }), // có kết quả nhưng thiếu ngày liên hệ
    fbRow({ stt: 6, contact: "8/10/2026", kq: "Đã nt Zalo" }), // thiếu NVKD
    fbRow({ stt: 7, nv: "Dung", contact: "8/10/2026" }), // thiếu kết quả
    fbRow({ stt: 8, nv: "Ai đó", contact: "8/10/2026", kq: "ok" }), // tên NVKD không khớp
    fbRow({ stt: 9, nv: "​", scan: "" }), // không có ngày quét -> bỏ
  ];
  const out = parseFacebookRows(rows, resolve, 2026);
  const by = (stt: number) => out.find((o) => o.sourceKey === `https://fb/${stt}`)!;

  it("bỏ dòng không có ngày quét", () => expect(out).toHaveLength(8));
  it("phân loại trạng thái", () => {
    expect(by(1).status).toBe("NEW");
    expect(by(2).status).toBe("ASSIGNED");
    expect(by(3).status).toBe("CONTACTED");
    expect(by(4).status).toBe("CONTACTED");
    expect(by(5).status).toBe("INCOMPLETE");
    expect(by(6).status).toBe("INCOMPLETE");
    expect(by(7).status).toBe("INCOMPLETE");
    expect(by(8).status).toBe("INCOMPLETE");
  });
  it("ghi rõ mục còn thiếu", () => {
    expect(by(5).missing).toBe("ngày liên hệ");
    expect(by(6).missing).toBe("NVKD nhận");
    expect(by(7).missing).toBe("kết quả");
    expect(by(8).missing).toBe("NVKD nhận (tên không khớp nhân viên)");
  });
  it("chỉ dòng đủ mới có phân loại kết quả; liên hệ được chỉ khi khách phản hồi", () => {
    expect(by(3).resultKind).toBe("NO_RESPONSE");
    expect(by(4).resultKind).toBe("REACHED");
    expect(by(5).resultKind).toBeNull();
    expect(by(3).assigneeId).toBe("u-dung");
  });
  it("không có link thì khoá theo ngày quét + STT", () => {
    const r = parseFacebookRows([FB_HEAD, [...fbRow({ stt: 12 }).slice(0, 10), "", ...fbRow({ stt: 12 }).slice(11)]], resolve, 2026);
    expect(r[0].sourceKey).toBe("fb|2026-10-07|12");
  });
});

describe("parseScanProspectRows — khách doanh nghiệp quét báo", () => {
  const head = ["STT", "Ngày tìm", "Hạng", "Điểm", "Tên công ty", "", "MST", "Ngành", "Khu vực / địa chỉ", "Tín hiệu mua hàng", "Sản phẩm nên chào", "Người liên hệ", "Điện thoại", "Email", "Nguồn", "NVKD phụ trách", "Ngày NVKD liên hệ", "Kênh liên hệ", "Kết quả liên hệ", "Ghi chú / khó khăn", "Bước tiếp theo", "Ngày hẹn tiếp"];
  const row = (o: { mst: string; nv?: string; date?: string; kenh?: string; kq?: string }) => [1, "02/10/2026", "A", 96, `Cty ${o.mst}`, "", o.mst, "SX", "HP", "NM mới", "carton", "Ông X", "0900", "", "báo", o.nv ?? "", o.date ?? "", o.kenh ?? "", o.kq ?? "", "", "", ""];
  const rows = [["TIÊU ĐỀ"], ["chú thích"], head, row({ mst: "1" }), row({ mst: "2", nv: "Tùng", kq: "Chưa liên hệ" }), row({ mst: "3", nv: "Tùng", date: "02/10/2026", kq: "Quan tâm, hẹn gọi lại" }), row({ mst: "4", nv: "Tùng", date: "02/10/2026", kenh: "Điện thoại", kq: "Quan tâm, hẹn gọi lại" })];
  const out = parseScanProspectRows(rows, resolve, 2026);
  it("tìm đúng dòng tiêu đề (sau dòng tiêu đề lớn) và phân trạng thái", () => {
    expect(out.map((o) => o.status)).toEqual(["NEW", "ASSIGNED", "INCOMPLETE", "CONTACTED"]);
    expect(out[2].missing).toBe("kênh liên hệ");
    expect(out[3].resultKind).toBe("REACHED");
    expect(out[3].sourceKey).toBe("SCAN|4");
    expect(out[3].origin).toBe("SCAN");
  });
});

describe("parseSelfRows — khách NVKD tự tìm", () => {
  const head = ["STT", "Ngày tìm", "Tên công ty", "MST", "Ngành", "Khu vực / địa chỉ", "Người liên hệ", "Điện thoại", "Ghi chú"];
  const rows = [
    head,
    [1, "14/11", "CÔNG TY A", "111", "nhựa", "BN", "", "024 3982", "Gọi máy bàn, hẹn gọi lại"],
    [2, "14/11", "CÔNG TY B", "222", "", "", "", "", ""],
    [3, "14/11", "CÔNG TY C", "333", "", "", "", "", "KNM"],
    [4, "", "", "", "", "", "", "", ""],
  ];
  const out = parseSelfRows(rows, "PT.DUNG", resolve, 2026);
  it("chủ tab là NVKD; có ghi kết quả + liên hệ thì đủ, chưa ghi kết quả thì mới chỉ 'đã giao'", () => {
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ status: "CONTACTED", assigneeId: "u-dung", contactDate: "2026-11-14", origin: "SELF", resultKind: "REACHED" });
    expect(out[1].status).toBe("ASSIGNED");
    expect(out[2]).toMatchObject({ status: "INCOMPLETE", missing: "người liên hệ / điện thoại" });
  });
});

describe("parseLogRows", () => {
  it("đọc nhật ký quét, trùng ngày+lượt không đè nhau", () => {
    const rows = [
      ["Ngày", "Lượt", "Trạng thái", "Số nhóm quét", "Số bài đọc", "Bài mới", "Nguyên nhân / ghi chú"],
      ["08/10/2026", "12h12", "Hỏng", 0, 0, 0, "treo"],
      ["14/11/2026", "8h15", "Thành công", 5, 107, 22, ""],
      ["14/11/2026", "8h15", "Thành công", 5, 10, 2, ""],
    ];
    const out = parseLogRows(rows, 2026);
    expect(out).toHaveLength(3);
    expect(out[2].slot).toBe("8h15#2");
    expect(out[1]).toMatchObject({ runDate: "2026-11-14", postsRead: 107, newPosts: 22 });
  });
});

describe("parseLeadWorkbook — nhận diện tab theo tiêu đề cột", () => {
  it("đọc đủ 4 loại tab từ 1 file xlsx, bỏ qua tab khác", () => {
    const wb = XLSX.utils.book_new();
    const add = (name: string, aoa: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    add("Hỏi hàng MXH", [FB_HEAD, fbRow({ stt: 1, nv: "Dung", contact: "7/10/2026", kq: "Đã gửi báo giá" })]);
    add("Nhật ký quét", [["Ngày", "Lượt", "Trạng thái", "Số nhóm quét", "Số bài đọc", "Bài mới", "Nguyên nhân / ghi chú"], ["14/11/2026", "8h15", "Thành công", 5, 107, 22, ""]]);
    add("Mr Tùng tự tìm", [["STT", "Ngày tìm", "Tên công ty", "MST", "Ngành", "Khu vực / địa chỉ", "Người liên hệ", "Điện thoại"], [1, "14/11/2026", "CÔNG TY X", "999", "", "", "Ông Y", "0900"]]);
    add("Danh mục", [["Kết quả liên hệ", "Kênh liên hệ"], ["Chưa liên hệ", "Điện thoại"]]);
    const out = parseLeadWorkbook(wb, resolve, 2026);
    expect(out.sheets.map((s) => [s.name, s.kind, s.rows])).toEqual([["Hỏi hàng MXH", "FB", 1], ["Nhật ký quét", "LOG", 1], ["Mr Tùng tự tìm", "SELF", 1]]);
    expect(out.items[0]).toMatchObject({ status: "CONTACTED", resultKind: "REACHED", assigneeId: "u-dung" });
    expect(out.prospects[0]).toMatchObject({ origin: "SELF", assigneeId: "u-tung", status: "ASSIGNED" });
    expect(out.logs[0].postsRead).toBe(107);
  });
});

describe("buildLeadReport", () => {
  const names = new Map([["u-dung", "Phạm Thị Dung"], ["u-tung", "Ngô Thanh Tùng"]]);
  const fb = [
    { scanDate: "2026-11-02", contactDate: null, assigneeId: null, assigneeName: null, status: "NEW", resultKind: null },
    { scanDate: "2026-11-02", contactDate: "2026-11-03", assigneeId: "u-dung", assigneeName: "Dung", status: "CONTACTED", resultKind: "REACHED" },
    { scanDate: "2026-11-02", contactDate: "2026-11-03", assigneeId: "u-dung", assigneeName: "Dung", status: "CONTACTED", resultKind: "WAITING" },
    { scanDate: "2026-11-09", contactDate: null, assigneeId: "u-tung", assigneeName: "Tùng", status: "INCOMPLETE", resultKind: null },
    { scanDate: "2026-11-09", contactDate: "2026-11-09", assigneeId: null, assigneeName: null, status: "INCOMPLETE", resultKind: null }, // ghi liên hệ nhưng thiếu NVKD: vẫn là chưa giao
    { scanDate: "2026-10-30", contactDate: "2026-11-10", assigneeId: "u-tung", assigneeName: "Tùng", status: "CONTACTED", resultKind: "NO_RESPONSE" },
  ];
  const r = buildLeadReport({ fb, prospects: [], logs: [], from: "2026-11-01", to: "2026-11-30", names });

  it("bài quét / khách nhận / liên hệ ghi nhận / liên hệ được trong kỳ", () => {
    expect(r.fb).toMatchObject({ total: 5, assigned: 3, unassigned: 2, contacted: 3, reached: 1, incomplete: 2 });
  });
  it("theo nhân viên", () => {
    const dung = r.fb.byEmployee.find((e) => e.employeeId === "u-dung")!;
    expect(dung).toMatchObject({ name: "Phạm Thị Dung", assigned: 2, contacted: 2, reached: 1, incomplete: 0 });
    const tung = r.fb.byEmployee.find((e) => e.employeeId === "u-tung")!;
    expect(tung).toMatchObject({ assigned: 1, contacted: 1, incomplete: 1 }); // bài quét 30/10 nằm ngoài kỳ nên không tính "nhận"
  });
  it("theo ngày / tuần / tháng", () => {
    const day = r.fb.series.day;
    expect(day.find((d) => d.key === "2026-11-02")).toMatchObject({ total: 3, assigned: 2, contacted: 0 });
    expect(day.find((d) => d.key === "2026-11-03")).toMatchObject({ total: 0, contacted: 2, reached: 1 });
    expect(r.fb.series.month).toHaveLength(1);
    expect(r.fb.series.month[0]).toMatchObject({ total: 5, contacted: 3 });
    // Tuần theo Kế hoạch tuần: 2/11 và 3/11 cùng tuần 1 tháng 11 (tuần 1 gồm 1–8/11), 9–10/11 tuần 2
    const wk = r.fb.series.week;
    expect(wk.map((w) => w.label)).toEqual(["Tuần 1 tháng 11/2026", "Tuần 2 tháng 11/2026"]);
    expect(wk[0]).toMatchObject({ total: 3, contacted: 2 });
    expect(wk[1]).toMatchObject({ total: 2, contacted: 1 });
  });
  it("nhật ký quét: chỉ lượt thành công cộng bài đọc", () => {
    const rep = buildLeadReport({
      fb: [], prospects: [], names,
      logs: [
        { runDate: "2026-11-02", status: "Thành công", groups: 5, postsRead: 100, newPosts: 10 },
        { runDate: "2026-11-02", status: "Hỏng", groups: 0, postsRead: 0, newPosts: 0 },
      ],
      from: "2026-11-01", to: "2026-11-30",
    });
    expect(rep.scanRuns).toMatchObject({ runs: 2, ok: 1, failed: 1, groups: 5, postsRead: 100, newPosts: 10 });
  });
  it("periodOf tuần theo tuần của Kế hoạch tuần", () => {
    expect(periodOf("2026-11-14", "week").label).toBe("Tuần 2 tháng 11/2026");
  });
});
