import { prisma, Prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { companyKey } from "./amisCustomers";

/**
 * Phân tích khách hỏi giá bằng Perplexity Agent API (anh Quân chốt 23/11/2026): với mỗi công ty MỚI xuất hiện trong báo giá của app báo giá,
 * tìm thông tin công khai trên web → ngành, loại hình, quy mô, khách làm gì, mình có thể bán thêm gì. Lưu ở bảng customer_analyses
 * (khoá companyKey, 1 công ty tốn tiền 1 lần). Chỉ là GỢI Ý hiện trên trang Báo giá — KHÔNG tự ghi vào hồ sơ khách (hồ sơ đủ/thiếu tính KPI).
 * Chỉ gửi tên công ty, địa chỉ giao hàng và tên mặt hàng — không gửi giá, không gửi tên NVKD.
 */

const API_KEY = process.env.PERPLEXITY_API_KEY;
const MODEL = process.env.PERPLEXITY_MODEL || "perplexity/sonar";
const ENDPOINT = "https://api.perplexity.ai/v1/agent";
const MAX_PER_RUN = Number(process.env.CUSTOMER_ANALYSIS_MAX_PER_RUN || 10);
const MAX_PER_DAY = Number(process.env.CUSTOMER_ANALYSIS_MAX_PER_DAY || 150);
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 6 * 3600_000;
// Lần đầu gọi với schema mới Perplexity có thể mất 10–30 giây (tài liệu của họ).
const TIMEOUT_MS = 90_000;

// Mã ngành — phải khớp INDUSTRIES ở apps/web/src/lib/customer-profile.ts.
export const INDUSTRY_CODES = ["DIEN_TU", "DUOC_YTE", "THUC_PHAM", "BAO_BI_IN", "CO_KHI", "DET_MAY", "HOA_CHAT", "NONG_NGHIEP", "LOGISTICS", "KHAC"] as const;
const STAFF_CODES = ["LT50", "50_200", "200_1000", "GT1000"] as const;
const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;

// Danh mục sản phẩm của mình đưa vào prompt để gợi ý "bán thêm". TẠM — anh Quân sửa lại cho đúng danh mục thật.
const OUR_PRODUCTS = process.env.CUSTOMER_ANALYSIS_PRODUCTS || "thùng carton, hộp carton, hộp giấy, khay nhựa, túi PE/PP, màng co, màng PE, băng keo, xốp PE foam, giấy lót, pallet";

export interface AnalysisInput {
  name: string;
  address: string | null;
  products: string | null;
}
export interface Analysis {
  found: boolean;
  industry: string | null;
  ownership: "FDI" | "VN" | null;
  companyType: string | null;
  staffSize: string | null;
  business: string | null;
  makes: string[];
  opportunities: { product: string; reason: string }[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
}
export interface AnalysisResult {
  analysis: Analysis;
  sources: { title: string; url: string }[];
  costUsd: number | null;
}

/** Lỗi không thể thử lại trong lượt chạy này (hết tiền / sai key / bị giới hạn tốc độ) → dừng cả lượt, không ghi FAILED cho từng khách. */
export class PerplexityBlockedError extends Error {}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "industry", "ownership", "companyType", "staffSize", "business", "makes", "opportunities", "confidence"],
  properties: {
    found: { type: "boolean", description: "true nếu tìm thấy thông tin công khai đáng tin về đúng công ty này" },
    industry: { type: "string", enum: [...INDUSTRY_CODES, "UNKNOWN"] },
    ownership: { type: "string", enum: ["FDI", "VN", "UNKNOWN"], description: "FDI = có vốn đầu tư nước ngoài; VN = doanh nghiệp Việt Nam" },
    companyType: { type: "string", description: "loại hình pháp lý ngắn, vd TNHH, Cổ phần, 100% vốn nước ngoài; rỗng nếu không rõ" },
    staffSize: { type: "string", enum: [...STAFF_CODES, "UNKNOWN"] },
    business: { type: "string", description: "công ty làm gì, 1-2 câu tiếng Việt" },
    makes: { type: "array", items: { type: "string" }, description: "sản phẩm công ty sản xuất hoặc kinh doanh, tối đa 6" },
    opportunities: {
      type: "array",
      description: "tối đa 4 sản phẩm trong danh mục của chúng tôi có thể bán thêm cho công ty này",
      items: { type: "object", additionalProperties: false, required: ["product", "reason"], properties: { product: { type: "string" }, reason: { type: "string" } } },
    },
    confidence: { type: "string", enum: [...CONFIDENCES] },
  },
} as const;

export function buildRequestBody(i: AnalysisInput) {
  const lines = [
    `Công ty khách hàng: ${i.name}`,
    i.address ? `Địa chỉ giao hàng: ${i.address}` : null,
    i.products ? `Mặt hàng khách hỏi giá: ${i.products}` : null,
    `Danh mục sản phẩm của chúng tôi: ${OUR_PRODUCTS}`,
    "",
    "Tìm thông tin công khai về công ty này và trả JSON đúng schema. industry chọn mã gần nhất (KHAC nếu không thuộc nhóm nào).",
    "opportunities chỉ chọn trong danh mục của chúng tôi, mỗi mục nêu lý do ngắn gắn với sản phẩm khách làm ra.",
  ].filter((l) => l !== null);
  return {
    model: MODEL,
    instructions:
      "Bạn là trợ lý phân tích khách hàng B2B cho phòng kinh doanh bao bì ở Việt Nam. Chỉ nêu điều tìm thấy trong nguồn công khai; không biết thì ghi UNKNOWN, để trống hoặc found=false, tuyệt đối không đoán. Nhiều công ty trùng tên: dùng địa chỉ giao hàng để chọn đúng công ty.",
    input: lines.join("\n"),
    tools: [{ type: "web_search", search_type: "fast", max_results: 5 }],
    response_format: { type: "json_schema", json_schema: { name: "customer_analysis", schema: SCHEMA } },
  };
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);

/** Đọc JSON do mô hình trả (có thể bọc ```json), kiểm tra từng trường, bỏ giá trị lạ thay vì tin. Ném lỗi nếu không phải JSON object. */
export function parseAnalysis(text: string): Analysis {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const raw = JSON.parse(cleaned) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Kết quả không phải JSON object");
  const makes = Array.isArray(raw.makes) ? raw.makes.map((m) => str(m, 120)).filter((m): m is string => !!m).slice(0, 6) : [];
  const opportunities = Array.isArray(raw.opportunities)
    ? raw.opportunities
        .map((o) => {
          const r = (o ?? {}) as Record<string, unknown>;
          const product = str(r.product, 120);
          const reason = str(r.reason, 240);
          return product && reason ? { product, reason } : null;
        })
        .filter((o): o is { product: string; reason: string } => !!o)
        .slice(0, 4)
    : [];
  return {
    found: raw.found === true,
    industry: oneOf(raw.industry, INDUSTRY_CODES),
    ownership: oneOf(raw.ownership, ["FDI", "VN"] as const),
    companyType: str(raw.companyType, 80),
    staffSize: oneOf(raw.staffSize, STAFF_CODES),
    business: str(raw.business, 400),
    makes,
    opportunities,
    confidence: oneOf(raw.confidence, CONFIDENCES) ?? "LOW",
  };
}

interface AgentResponse {
  output?: { type?: string; results?: { title?: string; url?: string }[]; content?: { type?: string; text?: string }[] }[];
  usage?: { cost?: { total_cost?: number } };
}

/** Lấy văn bản trả lời + nguồn từ phản hồi Agent API. Nguồn lấy từ kết quả tìm kiếm (link trong JSON do mô hình viết có thể bịa). */
export function readAgentResponse(res: AgentResponse): { text: string; sources: { title: string; url: string }[]; costUsd: number | null } {
  const out = res.output ?? [];
  const text = out
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("");
  const seen = new Set<string>();
  const sources: { title: string; url: string }[] = [];
  for (const o of out.filter((o) => o.type === "search_results")) {
    for (const r of o.results ?? []) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      sources.push({ title: (r.title ?? r.url).slice(0, 160), url: r.url });
    }
  }
  return { text, sources: sources.slice(0, 5), costUsd: res.usage?.cost?.total_cost ?? null };
}

export async function callPerplexity(i: AnalysisInput, fetchImpl: typeof fetch = fetch): Promise<AnalysisResult> {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(i)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if ([401, 402, 403, 429].includes(res.status)) throw new PerplexityBlockedError(`Perplexity ${res.status}: ${detail}`);
    throw new Error(`Perplexity ${res.status}: ${detail}`);
  }
  const { text, sources, costUsd } = readAgentResponse((await res.json()) as AgentResponse);
  if (!text) throw new Error("Perplexity không trả nội dung");
  return { analysis: parseAnalysis(text), sources, costUsd };
}

export interface QuoteForAnalysis {
  customerName: string;
  productInterest: string | null;
  deliveryAddress: string | null;
  requestedAt: Date | null;
}
export interface ExistingAnalysis {
  companyKey: string;
  status: string;
  attempts: number;
  analyzedAt: Date;
}

/**
 * Thuần: từ các báo giá + phân tích đã có, chọn công ty cần phân tích (mới nhất trước). Bỏ công ty đã có kết quả (kể cả NOT_FOUND);
 * công ty thất bại thì thử lại sau 6 giờ, tối đa 3 lần. Gộp mặt hàng của mọi báo giá cùng công ty để prompt đủ ý.
 */
export function pickCandidates(quotes: QuoteForAnalysis[], existing: ExistingAnalysis[], limit: number, now: Date): (AnalysisInput & { key: string })[] {
  const done = new Map(existing.map((e) => [e.companyKey, e]));
  const byKey = new Map<string, { name: string; address: string | null; products: Set<string>; latest: number }>();
  for (const q of quotes) {
    const key = companyKey(q.customerName);
    if (!key) continue;
    const e = done.get(key);
    if (e && !(e.status === "FAILED" && e.attempts < MAX_ATTEMPTS && now.getTime() - e.analyzedAt.getTime() >= RETRY_AFTER_MS)) continue;
    const cur = byKey.get(key) ?? { name: q.customerName.trim(), address: null, products: new Set<string>(), latest: 0 };
    cur.address ??= q.deliveryAddress?.trim() || null;
    if (q.productInterest?.trim()) cur.products.add(q.productInterest.trim());
    cur.latest = Math.max(cur.latest, q.requestedAt?.getTime() ?? 0);
    byKey.set(key, cur);
  }
  return [...byKey.entries()]
    .sort((a, b) => b[1].latest - a[1].latest)
    .slice(0, limit)
    .map(([key, v]) => ({ key, name: v.name, address: v.address, products: [...v.products].slice(0, 3).join("; ").slice(0, 300) || null }));
}

export function isCustomerAnalysisConfigured(): boolean {
  return !!API_KEY;
}

/** Chạy sau mỗi lần đồng bộ app báo giá. Mỗi lượt tối đa MAX_PER_RUN công ty, mỗi 24 giờ tối đa MAX_PER_DAY (chặn chi phí chạy lố). */
export async function runCustomerAnalysis(call: typeof callPerplexity = callPerplexity, now: Date = new Date()): Promise<number> {
  if (!API_KEY) return 0;
  const since = new Date(now.getTime() - 24 * 3600_000);
  const usedToday = await prisma.customerAnalysis.count({ where: { analyzedAt: { gte: since } } });
  const budget = Math.min(MAX_PER_RUN, MAX_PER_DAY - usedToday);
  if (budget <= 0) return 0;

  const quotes = await prisma.quoteRequest.findMany({
    where: { sourceApp: "BAOGIA_APP" },
    select: { customerName: true, productInterest: true, deliveryAddress: true, requestedAt: true },
  });
  const existing = await prisma.customerAnalysis.findMany({ select: { companyKey: true, status: true, attempts: true, analyzedAt: true } });
  const todo = pickCandidates(quotes, existing, budget, now);
  if (todo.length === 0) return 0;

  let done = 0;
  for (const c of todo) {
    try {
      const r = await call(c);
      const data = {
        customerName: c.name,
        status: r.analysis.found ? "OK" : "NOT_FOUND",
        error: null,
        industry: r.analysis.industry,
        ownership: r.analysis.ownership,
        companyType: r.analysis.companyType,
        staffSize: r.analysis.staffSize,
        business: r.analysis.business,
        makes: r.analysis.makes,
        opportunities: r.analysis.opportunities as unknown as Prisma.InputJsonValue,
        confidence: r.analysis.confidence,
        sources: r.sources as unknown as Prisma.InputJsonValue,
        costUsd: r.costUsd,
        analyzedAt: new Date(),
      };
      await prisma.customerAnalysis.upsert({ where: { companyKey: c.key }, create: { companyKey: c.key, ...data }, update: data });
      done++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof PerplexityBlockedError) {
        logger.error(`Phân tích khách dừng giữa chừng: ${message} (kiểm tra key / tín dụng Perplexity)`);
        break;
      }
      logger.warn(`Phân tích khách "${c.name}" lỗi: ${message}`);
      const prev = existing.find((e) => e.companyKey === c.key);
      const attempts = (prev?.attempts ?? 0) + 1;
      await prisma.customerAnalysis.upsert({
        where: { companyKey: c.key },
        create: { companyKey: c.key, customerName: c.name, status: "FAILED", attempts, error: message.slice(0, 300) },
        update: { status: "FAILED", attempts, error: message.slice(0, 300), analyzedAt: new Date() },
      });
    }
  }
  if (done > 0) logger.info(`Đã phân tích ${done}/${todo.length} khách hỏi giá mới (Perplexity).`);
  return done;
}
