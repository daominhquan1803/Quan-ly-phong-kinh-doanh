import { Sparkles } from "lucide-react";
import { INDUSTRIES, OWNERSHIPS, STAFF_SIZES } from "@/lib/customer-profile";
import { formatDateVN } from "@/lib/utils";

export interface QuoteAnalysis {
  status: "OK" | "NOT_FOUND";
  industry: string | null;
  ownership: string | null;
  companyType: string | null;
  staffSize: string | null;
  business: string | null;
  makes: string[];
  opportunities: { product: string; reason: string }[] | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  sources: { title: string; url: string }[] | null;
  analyzedAt: string;
}

const CONFIDENCE_LABEL = { HIGH: "Độ tin cậy cao", MEDIUM: "Độ tin cậy vừa", LOW: "Độ tin cậy thấp" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted2">{label}</p>
      <div className="text-ink mt-0.5">{children}</div>
    </div>
  );
}

/** Gợi ý AI (Perplexity) về khách hỏi giá — chỉ để tham khảo, không tự ghi vào hồ sơ khách. */
export function QuoteAnalysisPanel({ a }: { a: QuoteAnalysis }) {
  const sources = (a.sources ?? []).filter((s) => /^https?:\/\//.test(s.url));
  return (
    <div className="px-5 py-4 bg-amber-500/[0.04] border-l-2 border-amber-500/40 space-y-3 text-xs">
      <div className="flex items-center gap-2 text-amber-300">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="font-semibold">AI gợi ý, cần kiểm tra lại</span>
        {a.confidence && <span className="text-muted2">· {CONFIDENCE_LABEL[a.confidence]}</span>}
        <span className="ml-auto font-mono text-muted2">{formatDateVN(a.analyzedAt)}</span>
      </div>

      {a.status === "NOT_FOUND" ? (
        <p className="text-muted2">Không tìm thấy thông tin công khai đáng tin về công ty này.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Ngành">{a.industry ? INDUSTRIES[a.industry as keyof typeof INDUSTRIES] ?? a.industry : "—"}</Field>
            <Field label="Loại hình">
              {[a.ownership ? OWNERSHIPS[a.ownership as keyof typeof OWNERSHIPS] ?? a.ownership : null, a.companyType].filter(Boolean).join(" · ") || "—"}
            </Field>
            <Field label="Quy mô">{a.staffSize ? STAFF_SIZES[a.staffSize as keyof typeof STAFF_SIZES] ?? a.staffSize : "—"}</Field>
            <Field label="Khách sản xuất / kinh doanh">{a.makes.length ? a.makes.join(", ") : "—"}</Field>
          </div>
          {a.business && <Field label="Hoạt động">{a.business}</Field>}
          {(a.opportunities?.length ?? 0) > 0 && (
            <Field label="Có thể bán thêm">
              <ul className="space-y-1">
                {a.opportunities!.map((o) => (
                  <li key={o.product}>
                    <span className="font-semibold text-amber-300">{o.product}</span> <span className="text-muted-foreground">— {o.reason}</span>
                  </li>
                ))}
              </ul>
            </Field>
          )}
        </>
      )}

      {sources.length > 0 && (
        <p className="text-muted2">
          Nguồn:{" "}
          {sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">
                {s.title}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
