import { describe, it, expect } from "vitest";
import {
  emailListField,
  findInvalidEmail,
  isValidEmail,
  normalizeEmailList,
  parseEmailList,
  reminderMilestoneFor,
  reminderOccurrence,
} from "./debt-reminder";

// Hôm nay cố định 19/09/2026; dueDate = hôm nay + offset ngày (cùng ngày-lịch địa phương).
const TODAY = new Date(2026, 8, 19, 8, 0, 0);
function invoice(daysFromToday: number | null, overrides: Partial<Parameters<typeof reminderMilestoneFor>[0]> = {}) {
  return {
    dueDate: daysFromToday === null ? null : new Date(2026, 8, 19 + daysFromToday),
    originalAmount: 1000,
    paidAmount: 0,
    ...overrides,
  };
}

describe("reminderMilestoneFor", () => {
  it("còn đúng 7 ngày tới hạn -> D7", () => {
    expect(reminderMilestoneFor(invoice(7), TODAY)).toBe("D7");
  });

  it("còn 8 hoặc 6 ngày -> không nhắc", () => {
    expect(reminderMilestoneFor(invoice(8), TODAY)).toBeNull();
    expect(reminderMilestoneFor(invoice(6), TODAY)).toBeNull();
  });

  it("đúng ngày hạn (overdueDays === 0) -> D0", () => {
    expect(reminderMilestoneFor(invoice(0), TODAY)).toBe("D0");
  });

  it("ngày đầu tiên quá hạn -> OVERDUE, ngày thứ 2..6 -> không nhắc", () => {
    expect(reminderMilestoneFor(invoice(-1), TODAY)).toBe("OVERDUE");
    expect(reminderMilestoneFor(invoice(-2), TODAY)).toBeNull();
  });

  it("đã trả hết -> không nhắc dù đúng mốc", () => {
    expect(reminderMilestoneFor(invoice(7, { paidAmount: 1000 }), TODAY)).toBeNull();
  });

  it("trả một phần vẫn nhắc", () => {
    expect(reminderMilestoneFor(invoice(7, { paidAmount: 400 }), TODAY)).toBe("D7");
  });

  it("thiếu hạn thanh toán -> không nhắc", () => {
    expect(reminderMilestoneFor(invoice(null), TODAY)).toBeNull();
  });

  it("nguồn hoá đơn BASELINE cũng được nhắc (không còn giới hạn theo source, gọi không truyền source)", () => {
    expect(reminderMilestoneFor(invoice(7), TODAY)).toBe("D7");
  });
});

describe("reminderMilestoneFor - mốc OVERDUE lặp lại mỗi 7 ngày quá hạn", () => {
  it("quá hạn 1, 8, 15 ngày -> OVERDUE", () => {
    expect(reminderMilestoneFor(invoice(-1), TODAY)).toBe("OVERDUE");
    expect(reminderMilestoneFor(invoice(-8), TODAY)).toBe("OVERDUE");
    expect(reminderMilestoneFor(invoice(-15), TODAY)).toBe("OVERDUE");
  });

  it("quá hạn 7, 14 ngày (không đúng bội số) -> không nhắc", () => {
    expect(reminderMilestoneFor(invoice(-7), TODAY)).toBeNull();
    expect(reminderMilestoneFor(invoice(-14), TODAY)).toBeNull();
  });

  it("quá hạn lâu ngày (197, 200) vẫn theo đúng công thức, không có trần số lần", () => {
    expect(reminderMilestoneFor(invoice(-197), TODAY)).toBe("OVERDUE");
    expect(reminderMilestoneFor(invoice(-200), TODAY)).toBeNull();
  });
});

describe("reminderMilestoneFor - biên bổ sung", () => {
  it("trả dư (paid > original) hoặc hoá đơn 0đ -> không nhắc", () => {
    expect(reminderMilestoneFor(invoice(7, { paidAmount: 1500 }), TODAY)).toBeNull();
    expect(reminderMilestoneFor(invoice(-1, { originalAmount: 0 }), TODAY)).toBeNull();
  });

  it("đã trả hết cũng không nhắc ở mốc OVERDUE", () => {
    expect(reminderMilestoneFor(invoice(-1, { paidAmount: 1000 }), TODAY)).toBeNull();
  });

  it("còn nợ 1đ vẫn nhắc (không có ngưỡng tối thiểu)", () => {
    expect(reminderMilestoneFor(invoice(7, { paidAmount: 999 }), TODAY)).toBe("D7");
  });

  it("mốc không phụ thuộc thứ trong tuần (T7/CN vẫn nhắc, kế hoạch: không lọc ngày)", () => {
    // 19/09/2026 là Thứ 7, 20/09/2026 là Chủ nhật.
    const sat = new Date(2026, 8, 19, 8, 0, 0);
    const sun = new Date(2026, 8, 20, 8, 0, 0);
    expect(sat.getDay()).toBe(6);
    expect(sun.getDay()).toBe(0);
    expect(reminderMilestoneFor({ ...invoice(0), dueDate: new Date(2026, 8, 26) }, sat)).toBe("D7");
    expect(reminderMilestoneFor({ ...invoice(0), dueDate: new Date(2026, 8, 27) }, sun)).toBe("D7");
    expect(reminderMilestoneFor({ ...invoice(0), dueDate: new Date(2026, 8, 19) }, sun)).toBe("OVERDUE");
  });

  it("qua ranh giới tháng và năm vẫn đếm đúng ngày-lịch", () => {
    const base = { originalAmount: 1000, paidAmount: 0 };
    expect(reminderMilestoneFor({ ...base, dueDate: new Date(2026, 9, 5) }, new Date(2026, 8, 28, 8))).toBe("D7");
    expect(reminderMilestoneFor({ ...base, dueDate: new Date(2027, 0, 4) }, new Date(2026, 11, 28, 8))).toBe("D7");
    expect(reminderMilestoneFor({ ...base, dueDate: new Date(2026, 11, 31) }, new Date(2027, 0, 1, 8))).toBe("OVERDUE");
    // 2028 là năm nhuận: 22/02 -> 29/02 cách đúng 7 ngày.
    expect(reminderMilestoneFor({ ...base, dueDate: new Date(2028, 1, 29) }, new Date(2028, 1, 22, 8))).toBe("D7");
  });

  it("giờ trong ngày của dueDate/hôm nay không làm lệch mốc", () => {
    const base = { originalAmount: 1000, paidAmount: 0 };
    // hạn 26/09 23:59, hôm nay 19/09 00:01 -> vẫn còn đúng 7 ngày-lịch
    expect(reminderMilestoneFor({ ...base, dueDate: new Date(2026, 8, 26, 23, 59) }, new Date(2026, 8, 19, 0, 1))).toBe("D7");
    // hạn 18/09 00:00, hôm nay 19/09 23:59 -> ngày đầu quá hạn
    expect(reminderMilestoneFor({ ...base, dueDate: new Date(2026, 8, 18, 0, 0) }, new Date(2026, 8, 19, 23, 59))).toBe("OVERDUE");
  });

  it("dueDate dạng chuỗi ISO (như JSON từ API) cũng tính đúng", () => {
    const iso = new Date(2026, 8, 26).toISOString();
    expect(reminderMilestoneFor({ dueDate: iso, originalAmount: 1000, paidAmount: 0 }, TODAY)).toBe("D7");
  });

  it("dueDate là chuỗi rỗng -> coi như thiếu hạn, không nhắc", () => {
    expect(reminderMilestoneFor({ dueDate: "", originalAmount: 1000, paidAmount: 0 }, TODAY)).toBeNull();
  });
});

describe("reminderOccurrence", () => {
  it("D7 và D0 luôn là lần 1, bất kể số ngày truyền vào", () => {
    expect(reminderOccurrence("D7", -7)).toBe(1);
    expect(reminderOccurrence("D0", 0)).toBe(1);
  });

  it("OVERDUE: floor((days-1)/7)+1 — 1 -> 1, 7 -> 1, 8 -> 2, 14 -> 2, 15 -> 3, 197 -> 29", () => {
    expect(reminderOccurrence("OVERDUE", 1)).toBe(1);
    expect(reminderOccurrence("OVERDUE", 7)).toBe(1);
    expect(reminderOccurrence("OVERDUE", 8)).toBe(2);
    expect(reminderOccurrence("OVERDUE", 14)).toBe(2);
    expect(reminderOccurrence("OVERDUE", 15)).toBe(3);
    expect(reminderOccurrence("OVERDUE", 197)).toBe(29);
  });

  it("quá hạn 200 ngày -> lần thứ 29 (đúng con số nêu trong mục 'PHẢI XÁC NHẬN TRƯỚC KHI BẬT' của kế hoạch)", () => {
    // Bản thân ngày 200 KHÔNG phải ngày mốc thật (200-1 không chia hết 7 — xem describe phía trên,
    // invoice(-200) -> null); đây là kiểm CÔNG THỨC thuần khi được gọi trực tiếp với days=200, đúng
    // như con số anh Quân cần xác nhận trước khi bật DEBT_REMINDER_ENABLED=true.
    expect(reminderOccurrence("OVERDUE", 200)).toBe(29);
  });

  it("không có trần số lần — quá hạn rất lâu (1 năm = 365 ngày) vẫn ra số hợp lệ, không tràn/âm", () => {
    const n = reminderOccurrence("OVERDUE", 365);
    expect(n).toBe(Math.floor((365 - 1) / 7) + 1);
    expect(n).toBeGreaterThan(29);
    expect(Number.isFinite(n)).toBe(true);
  });
});

describe("parseEmailList", () => {
  it("tách được cả dấu phẩy và chấm phẩy, bỏ khoảng trắng thừa", () => {
    expect(parseEmailList(" a@x.com ;  b@y.com,c@z.com ")).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
  });

  it("chuỗi rỗng / null / chỉ toàn dấu phân cách -> mảng rỗng", () => {
    expect(parseEmailList("")).toEqual([]);
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList(" ; , ")).toEqual([]);
  });
});

describe("normalizeEmailList", () => {
  it("chuẩn hoá về join(', ') và giữ nguyên hoa/thường", () => {
    expect(normalizeEmailList("a@x.com ;  B@y.com ")).toBe("a@x.com, B@y.com");
  });

  it("bỏ phần rỗng giữa chừng và chạy lại nhiều lần vẫn cho cùng kết quả (idempotent)", () => {
    const once = normalizeEmailList("a@x.com,, ;b@y.com;");
    expect(once).toBe("a@x.com, b@y.com");
    expect(normalizeEmailList(once)).toBe(once);
  });

  it("không validate: địa chỉ sai vẫn được giữ nguyên (việc validate ở biên khác)", () => {
    expect(normalizeEmailList("abc; a@x.com")).toBe("abc, a@x.com");
  });

  it("rỗng -> null", () => {
    expect(normalizeEmailList("  ")).toBeNull();
    expect(normalizeEmailList(null)).toBeNull();
  });
});

describe("findInvalidEmail", () => {
  it("trả địa chỉ sai đầu tiên, tất cả hợp lệ hoặc rỗng -> undefined", () => {
    expect(findInvalidEmail("a@x.com; abc; d@y.com")).toBe("abc");
    expect(findInvalidEmail("a@x.com, b@y.com")).toBeUndefined();
    expect(findInvalidEmail("")).toBeUndefined();
  });

  it("chuỗi sai đầu/cuối vẫn bị bắt, null/undefined -> undefined", () => {
    expect(findInvalidEmail("abc; a@x.com")).toBe("abc");
    expect(findInvalidEmail("a@x.com; b@y")).toBe("b@y");
    expect(findInvalidEmail(null)).toBeUndefined();
    expect(findInvalidEmail(undefined)).toBeUndefined();
  });

  it("từ chối dạng có tên hiển thị / xuống dòng (chống chèn header thư ra ngoài)", () => {
    expect(findInvalidEmail("Nguyễn Văn A <a@x.com>")).toBeDefined();
    expect(findInvalidEmail("a@x.com\nBcc: nguoila@evil.com")).toBeDefined();
    expect(findInvalidEmail("a b@x.com")).toBeDefined();
  });
});

describe("isValidEmail", () => {
  it("chấp nhận địa chỉ bình thường, kể cả hoa/thường lẫn dấu + và .", () => {
    for (const ok of ["a@x.com", "Ten.Ho+tag@Cong-Ty.com.vn", "ketoan@hoanggia.vn"]) {
      expect(isValidEmail(ok)).toBe(true);
    }
  });

  it("từ chối địa chỉ thiếu @, thiếu tên miền, thiếu đuôi, rỗng", () => {
    for (const bad of ["abc", "a@", "@x.com", "a@x", "a@@x.com", "", " "]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe("emailListField (zod cho API nhập tay Customer.email)", () => {
  it("nhiều địa chỉ hợp lệ, undefined, null, chuỗi rỗng -> qua", () => {
    expect(emailListField.safeParse("a@x.com; b@y.com").success).toBe(true);
    expect(emailListField.safeParse(undefined).success).toBe(true);
    expect(emailListField.safeParse(null).success).toBe(true);
    expect(emailListField.safeParse("").success).toBe(true);
    expect(emailListField.safeParse("   ").success).toBe(true);
  });

  it("1 địa chỉ sai trong danh sách -> THẤT BẠI kèm message 'Email không hợp lệ: <địa chỉ sai>'", () => {
    const r = emailListField.safeParse("a@x.com; abc");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Email không hợp lệ: abc");
  });

  it("quá 500 ký tự -> thất bại", () => {
    const long = Array.from({ length: 60 }, (_, i) => `nguoi${i}@congty.com`).join(", ");
    expect(long.length).toBeGreaterThan(500);
    expect(emailListField.safeParse(long).success).toBe(false);
  });
});
