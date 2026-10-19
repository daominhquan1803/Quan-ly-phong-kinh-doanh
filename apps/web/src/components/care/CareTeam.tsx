"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, Lightbulb, Users } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import {
  CARE_CHANNEL_LABEL,
  CARE_OUTCOME_LABEL,
  ISSUE_TYPE_LABEL,
  VALUE_BAND_LABEL,
  type CareChannelKey,
  type CareOutcomeKey,
} from "@/lib/customer-care";
import { SEASON_STAGE_LABEL } from "@/lib/customer-season";
import type { CareTeamReport } from "@/lib/customer-care-team";

const card = "rounded-2xl border border-gray-200/30 p-4";
const KIND_LABEL = { ISSUE: "Có vấn đề", LOST: "Đã chuyển NCC khác", NO_CONTACT: "Không liên lạc được nhiều lần" } as const;
const KIND_STYLE = { ISSUE: "text-amber-400", LOST: "text-alert", NO_CONTACT: "text-sky-300" } as const;
const OUTCOME_ORDER: CareOutcomeKey[] = ["NORMAL", "UPCOMING_ORDER", "NEW_NEED", "ISSUE", "NO_CONTACT", "LOST"];
const todayYmd = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const money = (n: number) => `${Math.round(n / 1e6).toLocaleString("vi-VN")} tr`;

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "bad" | "good" }) {
  return (
    <div className={card}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone === "bad" ? "text-alert" : tone === "good" ? "text-emerald-300" : "text-ink")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function CareTeam({ onOpenCustomer }: { onOpenCustomer: (customerId: string) => void }) {
  const [date, setDate] = useState(todayYmd());
  const { data, isLoading, error } = useQuery({
    queryKey: ["care-team", date],
    queryFn: async () => {
      const res = await fetch(`/api/customer-care/team?date=${date}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được thống kê");
      return json as { report: CareTeamReport; scope: "TEAM" | "SELF" };
    },
  });

  const r = data?.report;
  const team = data?.scope === "TEAM";
  const warningTotal = r ? r.risks.length + r.followUps.length + r.seasons.length : 0;

  const link = (id: string, name: string) => (
    <button onClick={() => onOpenCustomer(id)} className="min-w-0 truncate text-left text-sm text-ink underline-offset-2 hover:underline">
      {name}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          max={todayYmd()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-lg border border-gray-200/40 bg-transparent px-3 py-1.5 text-sm text-ink"
        />
        {date !== todayYmd() && (
          <button onClick={() => setDate(todayYmd())} className="rounded-full border border-gray-200/40 px-3 py-1 text-xs text-ink2 hover:bg-white/5">
            Hôm nay
          </button>
        )}
        {!team && <span className="text-xs text-muted-foreground">Bạn chỉ thấy số liệu của chính mình.</span>}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Đang tính thống kê...</p>}
      {error && <p className="text-sm text-alert">{(error as Error).message}</p>}

      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={`Khách đã chăm sóc ${formatDateVN(r.date)}`} value={r.totals.customers} sub={`${r.totals.logs} lượt ghi`} tone={r.totals.customers > 0 ? "good" : "bad"} />
            {team && <Stat label="Thành viên đã chăm sóc" value={`${r.totals.membersCared}/${r.totals.membersTotal}`} sub={r.totals.membersCared < r.totals.membersTotal ? "Còn người chưa ghi" : "Đủ cả phòng"} tone={r.totals.membersCared === r.totals.membersTotal ? "good" : undefined} />}
            <Stat label="Cảnh báo" value={warningTotal} sub={`${r.risks.length} nguy cơ · ${r.followUps.length} đến hạn hẹn · ${r.seasons.length} tới vụ`} tone={warningTotal > 0 ? "bad" : "good"} />
            <Stat label="Vấn đề cần xử lý" value={r.issues.length} sub={`${r.issues.filter((i) => i.kind === "LOST").length} khách đã chuyển NCC`} tone={r.issues.length > 0 ? "bad" : "good"} />
          </div>

          <div className={cn(card, "overflow-x-auto")}>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Users className="h-4 w-4 text-amber-400" /> Chăm sóc theo thành viên
            </p>
            <table className="min-w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left font-medium">Thành viên</th>
                  <th className="py-1.5 text-right font-medium">Khách hôm nay</th>
                  <th className="py-1.5 text-right font-medium">Lượt ghi</th>
                  <th className="py-1.5 pl-3 text-left font-medium">Kết quả hôm nay</th>
                  <th className="py-1.5 text-right font-medium">7 ngày</th>
                  <th className="py-1.5 text-right font-medium">Tháng</th>
                  <th className="py-1.5 text-right font-medium">Phụ trách</th>
                  <th className="py-1.5 text-right font-medium">Cảnh báo</th>
                  <th className="py-1.5 text-right font-medium">Vấn đề</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {r.members.map((m) => {
                  const warn = m.warnings.risk + m.warnings.followUps + m.warnings.season;
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 font-medium text-ink">{m.name}</td>
                      <td className={cn("py-2 text-right font-mono font-semibold", m.today.customers === 0 ? "text-alert" : "text-emerald-300")}>
                        {m.today.customers === 0 ? "Chưa ghi" : m.today.customers}
                      </td>
                      <td className="py-2 text-right font-mono text-muted-foreground">{m.today.logs}</td>
                      <td className="py-2 pl-3">
                        <div className="flex flex-wrap gap-1.5">
                          {OUTCOME_ORDER.filter((o) => m.today.byOutcome[o]).map((o) => (
                            <span key={o} className="rounded-full border border-gray-200/30 px-2 py-0.5 text-[11px] text-ink2">
                              {CARE_OUTCOME_LABEL[o]} {m.today.byOutcome[o]}
                            </span>
                          ))}
                          {Object.entries(m.today.byChannel).map(([ch, n]) => (
                            <span key={ch} className="text-[11px] text-muted-foreground">
                              {CARE_CHANNEL_LABEL[ch as CareChannelKey]} {n}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono">{m.week}</td>
                      <td className="py-2 text-right font-mono">{m.month}</td>
                      <td className="py-2 text-right font-mono text-muted-foreground">{m.assigned}</td>
                      <td className={cn("py-2 text-right font-mono", warn > 0 ? "text-amber-400" : "text-muted-foreground")} title={`${m.warnings.risk} nguy cơ · ${m.warnings.followUps} đến hạn hẹn · ${m.warnings.season} tới vụ`}>
                        {warn}
                      </td>
                      <td className={cn("py-2 text-right font-mono", m.openIssues > 0 ? "text-alert" : "text-muted-foreground")}>{m.openIssues}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">“Khách hôm nay” = số khách khác nhau đã được ghi chăm sóc trong ngày. 7 ngày tính đến hết ngày chọn.</p>
          </div>

          <div className={card}>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <AlertTriangle className="h-4 w-4 text-alert" /> Vấn đề cần xử lý ({r.issues.length})
            </p>
            {r.issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có vấn đề tồn.</p>
            ) : (
              <div className="divide-y divide-gray-200/20">
                {r.issues.map((i) => (
                  <div key={i.customerId} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0">
                      {link(i.customerId, i.customerName)}
                      <p className="text-xs text-muted-foreground">
                        {i.employeeName ?? "—"} · ghi bởi {i.loggedBy}
                        {i.note ? ` — ${i.note}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-xs font-semibold", KIND_STYLE[i.kind])}>
                        {KIND_LABEL[i.kind]}
                        {i.kind === "ISSUE" && i.issueType ? ` · ${ISSUE_TYPE_LABEL[i.issueType as keyof typeof ISSUE_TYPE_LABEL] ?? i.issueType}` : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{i.days === 0 ? "hôm nay" : `${i.days} ngày chưa xử lý`}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className={card}>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <BellRing className="h-4 w-4 text-alert" /> Nguy cơ mất khách chưa chăm sóc ({r.risks.length})
              </p>
              {r.risks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có.</p>
              ) : (
                <div className="divide-y divide-gray-200/20">
                  {r.risks.slice(0, 15).map((k) => (
                    <div key={k.customerId} className="py-2">
                      {link(k.customerId, k.customerName)}
                      <p className="text-xs text-muted-foreground">
                        {k.employeeName} · <span className={k.level === "HIGH" ? "text-alert" : "text-amber-400"}>{k.level === "HIGH" ? "Nguy cơ cao" : "Cảnh báo"}</span> · im {k.silentDays} ngày
                        {k.medianGapDays ? ` (nhịp ${k.medianGapDays} ngày)` : ""} · {money(k.totalValue)}
                      </p>
                    </div>
                  ))}
                  {r.risks.length > 15 && <p className="pt-2 text-xs text-muted-foreground">... và {r.risks.length - 15} khách nữa</p>}
                </div>
              )}
            </div>

            <div className={card}>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <BellRing className="h-4 w-4 text-amber-400" /> Đến hạn hẹn chăm sóc lại ({r.followUps.length})
              </p>
              {r.followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có.</p>
              ) : (
                <div className="divide-y divide-gray-200/20">
                  {r.followUps.slice(0, 15).map((f) => (
                    <div key={f.customerId} className="py-2">
                      {link(f.customerId, f.customerName)}
                      <p className="text-xs text-muted-foreground">
                        {f.employeeName} · hẹn {formatDateVN(f.followUpAt)} {f.overdueDays > 0 ? `· trễ ${f.overdueDays} ngày` : "· hôm nay"}
                      </p>
                    </div>
                  ))}
                  {r.followUps.length > 15 && <p className="pt-2 text-xs text-muted-foreground">... và {r.followUps.length - 15} khách nữa</p>}
                </div>
              )}
            </div>

            <div className={card}>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <BellRing className="h-4 w-4 text-sky-300" /> Khách mua theo vụ ({r.seasons.length})
              </p>
              {r.seasons.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa tới vụ khách nào.</p>
              ) : (
                <div className="divide-y divide-gray-200/20">
                  {r.seasons.slice(0, 15).map((s) => (
                    <div key={s.customerId} className="py-2">
                      {link(s.customerId, s.customerName)}
                      <p className="text-xs text-muted-foreground">
                        {s.employeeName} · {SEASON_STAGE_LABEL[s.stage as keyof typeof SEASON_STAGE_LABEL] ?? s.stage} · vụ tháng {s.seasonMonth}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={card}>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Lightbulb className="h-4 w-4 text-emerald-300" /> Cơ hội bán hàng mới trong 30 ngày ({r.opportunities.length})
            </p>
            {r.opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có.</p>
            ) : (
              <div className="divide-y divide-gray-200/20">
                {r.opportunities.map((o, idx) => (
                  <div key={`${o.customerId}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      {link(o.customerId, o.customerName)}
                      <p className="text-xs text-muted-foreground">
                        {o.employeeName} · {formatDateVN(o.at)}
                      </p>
                    </div>
                    <p className="text-xs text-ink2">
                      {o.needGroup ?? "—"}
                      {o.needValueBand ? ` · ${VALUE_BAND_LABEL[o.needValueBand as keyof typeof VALUE_BAND_LABEL] ?? o.needValueBand}` : ""}
                      {o.expectedMonth ? ` · tháng ${o.expectedMonth}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
