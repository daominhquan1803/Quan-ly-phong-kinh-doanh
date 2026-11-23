import { describe, it, expect, vi } from "vitest";

vi.mock("@hoanggia/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@hoanggia/db")>()), prisma: {} }));
vi.mock("./amis", () => ({ getAmisToken: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { buildRequestBody, parseAnalysis, pickCandidates, readAgentResponse } from "./customerAnalysis";

const goodJson = {
  found: true,
  industry: "DIEN_TU",
  ownership: "FDI",
  companyType: "100% vốn nước ngoài",
  staffSize: "GT1000",
  business: "Sản xuất máy in laser.",
  makes: ["Máy in laser", "Linh kiện"],
  opportunities: [{ product: "Thùng carton", reason: "Đóng gói máy in thành phẩm" }],
  confidence: "HIGH",
};

describe("parseAnalysis", () => {
  it("đọc JSON hợp lệ, kể cả bọc ```json", () => {
    expect(parseAnalysis(JSON.stringify(goodJson))).toMatchObject({ found: true, industry: "DIEN_TU", ownership: "FDI", staffSize: "GT1000", confidence: "HIGH" });
    expect(parseAnalysis("```json\n" + JSON.stringify(goodJson) + "\n```").makes).toEqual(["Máy in laser", "Linh kiện"]);
  });
  it("UNKNOWN / giá trị lạ → null, không tin; thiếu độ tin cậy → LOW", () => {
    const a = parseAnalysis(JSON.stringify({ ...goodJson, industry: "UNKNOWN", ownership: "TAU", staffSize: "nhiều", confidence: "chắc chắn", companyType: "  " }));
    expect(a).toMatchObject({ industry: null, ownership: null, staffSize: null, companyType: null, confidence: "LOW" });
  });
  it("bỏ cơ hội thiếu sản phẩm/lý do, cắt tối đa 4 cơ hội và 6 sản phẩm", () => {
    const opp = Array.from({ length: 6 }, (_, i) => ({ product: `P${i}`, reason: "r" }));
    const a = parseAnalysis(JSON.stringify({ ...goodJson, opportunities: [{ product: "x" }, ...opp], makes: Array.from({ length: 9 }, (_, i) => `m${i}`) }));
    expect(a.opportunities).toHaveLength(4);
    expect(a.makes).toHaveLength(6);
  });
  it("không phải JSON object → ném lỗi", () => {
    expect(() => parseAnalysis("Xin lỗi, tôi không tìm thấy")).toThrow();
    expect(() => parseAnalysis("[1,2]")).toThrow();
  });
});

describe("readAgentResponse", () => {
  it("lấy văn bản từ message, nguồn từ search_results (bỏ trùng), chi phí từ usage", () => {
    const r = readAgentResponse({
      output: [
        { type: "search_results", results: [{ title: "A", url: "https://a.vn" }, { title: "A lại", url: "https://a.vn" }, { url: "https://b.vn" }] },
        { type: "message", content: [{ type: "output_text", text: "{\"found\":true}" }] },
      ],
      usage: { cost: { total_cost: 0.00234 } },
    });
    expect(r.text).toBe("{\"found\":true}");
    expect(r.sources).toEqual([{ title: "A", url: "https://a.vn" }, { title: "https://b.vn", url: "https://b.vn" }]);
    expect(r.costUsd).toBe(0.00234);
  });
});

describe("buildRequestBody", () => {
  it("gửi tên công ty/địa chỉ/mặt hàng, bắt buộc JSON schema, có công cụ tìm web", () => {
    const b = buildRequestBody({ name: "Công ty ABC", address: "KCN Quế Võ", products: "Thùng carton 5 lớp" });
    expect(b.input).toContain("Công ty ABC");
    expect(b.input).toContain("KCN Quế Võ");
    expect(b.input).toContain("Thùng carton 5 lớp");
    expect(b.response_format.type).toBe("json_schema");
    expect(b.tools[0].type).toBe("web_search");
  });
});

describe("pickCandidates", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const q = (customerName: string, requestedAt: string, productInterest: string | null = null, deliveryAddress: string | null = null) => ({
    customerName,
    productInterest,
    deliveryAddress,
    requestedAt: new Date(requestedAt),
  });

  it("gộp báo giá cùng công ty (khác cách viết), mới nhất trước, gộp mặt hàng", () => {
    const list = pickCandidates(
      [q("Công ty TNHH ABC", "2026-11-01T00:00:00Z", "Thùng"), q("ABC Co., Ltd", "2026-11-20T00:00:00Z", "Khay", "Bắc Ninh"), q("XYZ", "2026-11-10T00:00:00Z")],
      [],
      10,
      now
    );
    expect(list.map((c) => c.key)).toEqual(["abc", "xyz"]);
    expect(list[0].products).toBe("Thùng; Khay");
    expect(list[0].address).toBe("Bắc Ninh");
  });
  it("bỏ công ty đã có kết quả; thất bại thì thử lại sau 6 giờ, tối đa 3 lần", () => {
    const h = (n: number) => new Date(now.getTime() - n * 3600_000);
    const quotes = [q("A", "2026-11-20T00:00:00Z"), q("B", "2026-11-19T00:00:00Z"), q("C", "2026-11-18T00:00:00Z"), q("D", "2026-11-17T00:00:00Z"), q("E", "2026-11-16T00:00:00Z")];
    const existing = [
      { companyKey: "a", status: "OK", attempts: 0, analyzedAt: h(100) },
      { companyKey: "b", status: "NOT_FOUND", attempts: 0, analyzedAt: h(100) },
      { companyKey: "c", status: "FAILED", attempts: 1, analyzedAt: h(1) }, // chưa đủ 6 giờ
      { companyKey: "d", status: "FAILED", attempts: 1, analyzedAt: h(7) }, // thử lại
      { companyKey: "e", status: "FAILED", attempts: 3, analyzedAt: h(100) }, // hết lượt
    ];
    expect(pickCandidates(quotes, existing, 10, now).map((c) => c.key)).toEqual(["d"]);
  });
  it("giới hạn số lượng mỗi lượt và bỏ tên rỗng", () => {
    const quotes = [q("A1", "2026-11-03T00:00:00Z"), q("B1", "2026-11-02T00:00:00Z"), q("C1", "2026-11-01T00:00:00Z"), q("Công ty TNHH", "2026-11-04T00:00:00Z")];
    expect(pickCandidates(quotes, [], 2, now).map((c) => c.key)).toEqual(["a1", "b1"]);
  });
});
