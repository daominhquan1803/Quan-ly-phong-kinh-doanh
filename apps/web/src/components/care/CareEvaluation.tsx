"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, ShieldCheck } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import { CARE_CHANNEL_LABEL, CARE_OUTCOME_LABEL, type CareChannelKey, type CareOutcomeKey } from "@/lib/customer-care";
import type { CareEvaluation as Eval } from "@/lib/customer-care-plan";
import { TIER_STYLE, TIER_TEXT, usePlan } from "./DuePlan";

const card = "rounded-2xl border border-gray-200/30 p-4";
const ymNow = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
const ymPrev = () => {
  const [y, m] = ymNow().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x)}%`);
const tone = (x: number | null, good = 90, warn = 70) => (x == null ? "text-muted-foreground" : x >= good ? "text-emerald-300" : x >= warn ? "text-amber-400" : "text-alert");

/** Đánh giá chăm sóc từng NVKD (điểm CSKH /10) + khách A đang quá hạn. */
export function CareEvaluation({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const [period, setPeriod] = useState<"month" | "prev" | "week">("month");
  const { data, isLoading, error } = useQuery({
    queryKey: ["care-eval", period],
    queryFn: async () => {
      const q = period === "week" ? "eval=week" : `eval=month&month=${period === "month" ? ymNow() : ymPrev()}`;
      const res = await fetch(`/api/customer-care/plan?${q}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được đánh giá");
      return json as { scope: "TEAM" | "SELF"; range: { from: number; to: number }; evaluations: Eval[] };
    },
  });
  const plan = usePlan();
  const overdueA = (plan.data?.customers ?? []).filter((c) => c.tier === "A" && c.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays);
  const nameOf = new Map((plan.data?.employees ?? []).map((e) => [e.id, e.name]));

  return (
    <div className={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Gauge className="h-4 w-4 text-amber-400" /> Đánh giá chăm sóc
          {data && <span className="font-normal text-muted-foreground">({formatDateVN(new Date(data.range.from).toISOString())} – {formatDateVN(new Date(data.range.to).toISOString())})</span>}
        </p>
        <div className="flex gap-1.5">
          {([
            ["month", "Tháng này"],
            ["prev", "Tháng trước"],
            ["week", "Tuần trước"],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className={cn("rounded-full border px-3 py-1 text-xs", period === k ? "border-amber-400 bg-amber-500/15 font-semibold text-amber-400" : "border-gray-200/40 text-ink2")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Đang tính...</p>}
      {error && <p className="text-sm text-alert">{(error as Error).message}</p>}
      {data && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1.5 text-left font-medium">NVKD</th>
                <th className="py-1.5 text-right font-medium" title="Số khách trong lịch theo hạng A/B/C/Ngủ">Lịch A/B/C/Ngủ</th>
                <th className="py-1.5 text-right font-medium" title="Khách đang quá hạn chăm sóc (trong đó hạng A)">Đang quá hạn</th>
                <th className="py-1.5 text-right font-medium" title="Trung bình mỗi ngày làm việc: % khách chưa quá hạn (50% điểm)">Chạm đúng hạn</th>
                <th className="py-1.5 text-right font-medium" title="Như trên nhưng chỉ khách A (30% điểm)">Phủ khách A</th>
                <th className="py-1.5 text-right font-medium" title="Khách bị báo nguy cơ được chạm trong 2 ngày làm việc (10% điểm)">Phản ứng cảnh báo</th>
                <th className="py-1.5 text-right font-medium" title="Vấn đề được ghi 'Đã xử lý xong' trong 7 ngày (10% điểm)">Xử lý vấn đề</th>
                <th className="py-1.5 text-right font-medium">Lượt ghi</th>
                <th className="py-1.5 text-right font-medium" title="Tỷ lệ 'không liên lạc được'">Không LL</th>
                <th className="py-1.5 text-right font-medium" title="Cơ hội mới / đã thành đơn trong 60 ngày">Cơ hội</th>
                <th className="py-1.5 text-right font-medium" title="Kiểm tra chéo: ghi khống / đã kiểm">Ghi khống</th>
                <th className="py-1.5 text-right font-medium text-amber-300">Điểm CSKH /10</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.evaluations.map((v) => (
                <tr key={v.employeeId}>
                  <td className="py-2 pr-3 font-medium text-ink">{v.name}</td>
                  <td className="py-2 text-right font-mono text-muted-foreground">
                    {v.planSize.A}/{v.planSize.B}/{v.planSize.C}/{v.planSize.NGU}
                  </td>
                  <td className={cn("py-2 text-right font-mono", v.overdueNow > 0 ? "text-amber-400" : "text-muted-foreground")}>
                    {v.overdueNow}
                    {v.overdueA > 0 && <span className="text-alert"> (A {v.overdueA})</span>}
                  </td>
                  <td className={cn("py-2 text-right font-mono font-semibold", tone(v.onTimePct))}>{pct(v.onTimePct)}</td>
                  <td className={cn("py-2 text-right font-mono font-semibold", tone(v.aPct, 95, 80))}>{pct(v.aPct)}</td>
                  <td className={cn("py-2 text-right font-mono", tone(v.alertPct))}>
                    {pct(v.alertPct)} <span className="text-muted-foreground">({v.alertTotal})</span>
                  </td>
                  <td className={cn("py-2 text-right font-mono", tone(v.issuePct))}>
                    {pct(v.issuePct)} <span className="text-muted-foreground">({v.issueTotal})</span>
                  </td>
                  <td className="py-2 text-right font-mono">{v.logs}</td>
                  <td className={cn("py-2 text-right font-mono", (v.noContactPct ?? 0) > 30 ? "text-amber-400" : "text-muted-foreground")}>{pct(v.noContactPct)}</td>
                  <td className="py-2 text-right font-mono">
                    {v.newNeeds}/{v.needsConverted}
                  </td>
                  <td className={cn("py-2 text-right font-mono", v.fakes > 0 ? "text-alert" : "text-muted-foreground")}>
                    {v.fakes}/{v.checks}
                    {v.penalty > 0 && <span className="block text-[10px]">−{v.penalty}đ KPI</span>}
                  </td>
                  <td className="py-2 text-right font-mono text-sm font-bold text-amber-400">{v.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Điểm CSKH = 50% chạm đúng hạn + 30% phủ khách A + 20% phản ứng cảnh báo & xử lý vấn đề. Tháng 11/2026 chạy thử; từ 12/2026 thay mục “CSKH / Đi gặp KH” trong KPI tháng. Ghi khống: −5đ/lần, tối đa −10đ.
          </p>
        </div>
      )}

      {overdueA.length > 0 && (
        <div className="mt-4 border-t border-gray-200/20 pt-3">
          <p className="mb-2 text-xs font-semibold text-alert">Khách A đang quá hạn ({overdueA.length})</p>
          <div className="flex flex-wrap gap-2">
            {overdueA.map((c) => (
              <button key={c.id} onClick={() => onOpenCustomer(c.id)} title={c.customerName} className="rounded-lg border border-red-500/30 px-2 py-1 text-left text-xs hover:bg-red-500/10">
                <span className={cn("mr-1 rounded border px-1 text-[10px] font-bold", TIER_STYLE[c.tier])}>{TIER_TEXT[c.tier]}</span>
                <span className="font-mono font-semibold text-ink">{c.customerCode}</span>
                <span className="ml-1 text-alert">trễ {c.overdueDays}n</span>
                {plan.data?.scope === "TEAM" && <span className="ml-1 text-muted-foreground">· {nameOf.get(c.employeeId)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Sample {
  id: string;
  employeeId: string;
  channel: string;
  outcome: string;
  note: string | null;
  createdAt: string;
  employee: { name: string };
  customer: { id: string; customerCode: string; customerName: string; contactPerson: string | null };
  spotCheck: { result: "OK" | "FAKE"; note: string | null; createdAt: string; checkedBy: { name: string } } | null;
}

/** Kiểm tra chéo: 3 lần ghi ngẫu nhiên / NVKD / tuần trước — trưởng phòng gọi khách xác minh. */
export function SpotChecks({ canVerify, onOpenCustomer }: { canVerify: boolean; onOpenCustomer: (id: string) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["care-spot-checks"],
    queryFn: async () => {
      const res = await fetch("/api/customer-care/spot-checks");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được");
      return json as { range: { from: number; to: number }; samples: Sample[] };
    },
  });
  const [err, setErr] = useState<string | null>(null);

  async function mark(logId: string, result: "OK" | "FAKE") {
    setErr(null);
    let note: string | null = null;
    if (result === "FAKE") {
      note = prompt("Vì sao xác định là ghi khống? (vd khách nói không ai gọi)");
      if (!note) return;
    }
    const res = await fetch("/api/customer-care/spot-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logId, result, note }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error ?? "Không lưu được");
    qc.invalidateQueries({ queryKey: ["care-spot-checks"] });
    qc.invalidateQueries({ queryKey: ["care-eval"] });
  }

  return (
    <div className={card}>
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <ShieldCheck className="h-4 w-4 text-sky-300" /> Kiểm tra chéo tuần trước
        {data && <span className="font-normal text-muted-foreground">({formatDateVN(new Date(data.range.from).toISOString())} – {formatDateVN(new Date(data.range.to).toISOString())})</span>}
      </p>
      <p className="mb-3 text-[11px] text-muted-foreground">App chọn ngẫu nhiên 3 lần ghi của mỗi NVKD. Gọi lại khách hỏi có đúng được liên hệ không rồi bấm Đúng / Ghi khống.</p>
      {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {err && <p className="text-sm text-alert">{err}</p>}
      {data && data.samples.length === 0 && <p className="text-sm text-muted-foreground">Tuần trước chưa có lần ghi chăm sóc nào để kiểm tra.</p>}
      {data && data.samples.length > 0 && (
        <div className="divide-y divide-gray-200/20">
          {data.samples.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                <button onClick={() => onOpenCustomer(s.customer.id)} title={s.customer.customerName} className="font-mono text-sm font-semibold text-amber-400 hover:underline">
                  {s.customer.customerCode}
                </button>
                <span className="ml-2 text-ink2">{s.customer.customerName}</span>
                <p className="text-muted-foreground">
                  {s.employee.name} · {formatDateVN(s.createdAt)} · {CARE_CHANNEL_LABEL[s.channel as CareChannelKey]} · {CARE_OUTCOME_LABEL[s.outcome as CareOutcomeKey]}
                  {s.customer.contactPerson ? ` · liên hệ: ${s.customer.contactPerson}` : ""}
                  {s.note ? ` — ${s.note}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {s.spotCheck && (
                  <p className={s.spotCheck.result === "OK" ? "text-emerald-300" : "text-alert"}>
                    {s.spotCheck.result === "OK" ? "Đúng" : "Ghi khống"} · {s.spotCheck.checkedBy.name}
                    {s.spotCheck.note ? ` — ${s.spotCheck.note}` : ""}
                  </p>
                )}
                {canVerify && (
                  <div className="mt-1 flex justify-end gap-1.5">
                    <button onClick={() => mark(s.id, "OK")} className="rounded-lg border border-emerald-500/40 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/10">
                      Đúng
                    </button>
                    <button onClick={() => mark(s.id, "FAKE")} className="rounded-lg border border-red-500/30 px-2 py-0.5 text-red-300 hover:bg-red-500/10">
                      Ghi khống
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
