"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, ClipboardList, Lightbulb, Users } from "lucide-react";
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
import type { CareDetail, CareDetailsReport, CareTeamReport } from "@/lib/customer-care-team";
import { CareEvaluation, SpotChecks } from "./CareEvaluation";

const card = "rounded-2xl border border-gray-200/30 p-4";
const KIND_LABEL = { ISSUE: "Có vấn đề", LOST: "Đã chuyển NCC khác", NO_CONTACT: "Không liên lạc được nhiều lần" } as const;
const KIND_STYLE = { ISSUE: "text-amber-400", LOST: "text-alert", NO_CONTACT: "text-sky-300" } as const;
const OUTCOME_ORDER: CareOutcomeKey[] = ["NORMAL", "UPCOMING_ORDER", "NEW_NEED", "ISSUE", "NO_CONTACT", "LOST"];
const OUTCOME_TONE: Record<string, string> = {
  NORMAL: "text-emerald-300 border-emerald-500/40",
  UPCOMING_ORDER: "text-sky-300 border-sky-500/40",
  NEW_NEED: "text-amber-400 border-amber-500/40",
  ISSUE: "text-alert border-red-500/40",
  NO_CONTACT: "text-muted-foreground border-gray-200/30",
  LOST: "text-alert border-red-500/40",
};
const todayYmd = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const money = (n: number) => `${Math.round(n / 1e6).toLocaleString("vi-VN")} tr`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "bad" | "good" }) {
  return (
    <div className={card}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone === "bad" ? "text-alert" : tone === "good" ? "text-emerald-300" : "text-ink")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Ô chọn nhân viên riêng cho từng mục. */
function EmployeeFilter({ members, value, onChange }: { members: { id: string; name: string }[]; value: string; onChange: (v: string) => void }) {
  if (members.length < 2) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-200/40 bg-card px-2.5 py-1 text-xs text-ink"
      aria-label="Lọc theo nhân viên"
    >
      <option value="">Tất cả nhân viên</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function SectionHead({ icon, title, count, right }: { icon: React.ReactNode; title: string; count?: number; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        {icon} {title}
        {count !== undefined && ` (${count})`}
      </p>
      {right}
    </div>
  );
}

export function CareTeam({ onOpenCustomer, canVerify }: { onOpenCustomer: (customerId: string) => void; canVerify: boolean }) {
  const [date, setDate] = useState(todayYmd());
  const [fIssues, setFIssues] = useState("");
  const [fRisks, setFRisks] = useState("");
  const [fFollow, setFFollow] = useState("");
  const [fSeason, setFSeason] = useState("");
  const [fOpp, setFOpp] = useState("");
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
  const by = <T extends { employeeId: string | null }>(rows: T[], f: string) => (f ? rows.filter((x) => x.employeeId === f) : rows);

  // Mã khách cho gọn; tên đầy đủ hiện khi rê chuột
  const code = (id: string, customerCode: string, name: string) => (
    <button onClick={() => onOpenCustomer(id)} title={name} className="shrink-0 font-mono text-sm font-semibold text-amber-400 underline-offset-2 hover:underline">
      {customerCode}
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

          <CareEvaluation onOpenCustomer={onOpenCustomer} />

          <div className={cn(card, "overflow-x-auto")}>
            <SectionHead icon={<Users className="h-4 w-4 text-amber-400" />} title="Chăm sóc theo thành viên" />
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

          <DetailsSection team={team} onOpenCustomer={onOpenCustomer} />

          <div className={card}>
            <SectionHead
              icon={<AlertTriangle className="h-4 w-4 text-alert" />}
              title="Vấn đề cần xử lý"
              count={by(r.issues, fIssues).length}
              right={team && <EmployeeFilter members={r.members} value={fIssues} onChange={setFIssues} />}
            />
            {by(r.issues, fIssues).length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có vấn đề tồn.</p>
            ) : (
              <div className="divide-y divide-gray-200/20">
                {by(r.issues, fIssues).map((i) => (
                  <div key={i.customerId} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {code(i.customerId, i.customerCode, i.customerName)}
                        <span className="truncate text-xs text-ink2">{i.customerName}</span>
                      </div>
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
              <SectionHead
                icon={<BellRing className="h-4 w-4 text-alert" />}
                title="Nguy cơ mất khách chưa chăm sóc"
                count={by(r.risks, fRisks).length}
                right={team && <EmployeeFilter members={r.members} value={fRisks} onChange={setFRisks} />}
              />
              {by(r.risks, fRisks).length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có.</p>
              ) : (
                <div className="divide-y divide-gray-200/20">
                  {by(r.risks, fRisks).slice(0, 15).map((k) => (
                    <div key={k.customerId} className="py-2">
                      {code(k.customerId, k.customerCode, k.customerName)}
                      <p className="text-xs text-muted-foreground">
                        {k.employeeName} · <span className={k.level === "HIGH" ? "text-alert" : "text-amber-400"}>{k.level === "HIGH" ? "Nguy cơ cao" : "Cảnh báo"}</span> · im {k.silentDays} ngày
                        {k.medianGapDays ? ` (nhịp ${k.medianGapDays} ngày)` : ""} · {money(k.totalValue)}
                      </p>
                    </div>
                  ))}
                  {by(r.risks, fRisks).length > 15 && <p className="pt-2 text-xs text-muted-foreground">... và {by(r.risks, fRisks).length - 15} khách nữa</p>}
                </div>
              )}
            </div>

            <div className={card}>
              <SectionHead
                icon={<BellRing className="h-4 w-4 text-amber-400" />}
                title="Đến hạn hẹn chăm sóc lại"
                count={by(r.followUps, fFollow).length}
                right={team && <EmployeeFilter members={r.members} value={fFollow} onChange={setFFollow} />}
              />
              {by(r.followUps, fFollow).length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có.</p>
              ) : (
                <div className="divide-y divide-gray-200/20">
                  {by(r.followUps, fFollow).slice(0, 15).map((f) => (
                    <div key={f.customerId} className="py-2">
                      {code(f.customerId, f.customerCode, f.customerName)}
                      <p className="text-xs text-muted-foreground">
                        {f.employeeName} · hẹn {formatDateVN(f.followUpAt)} {f.overdueDays > 0 ? `· trễ ${f.overdueDays} ngày` : "· hôm nay"}
                      </p>
                    </div>
                  ))}
                  {by(r.followUps, fFollow).length > 15 && <p className="pt-2 text-xs text-muted-foreground">... và {by(r.followUps, fFollow).length - 15} khách nữa</p>}
                </div>
              )}
            </div>

            <div className={card}>
              <SectionHead
                icon={<BellRing className="h-4 w-4 text-sky-300" />}
                title="Khách mua theo vụ"
                count={by(r.seasons, fSeason).length}
                right={team && <EmployeeFilter members={r.members} value={fSeason} onChange={setFSeason} />}
              />
              {by(r.seasons, fSeason).length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa tới vụ khách nào.</p>
              ) : (
                <div className="divide-y divide-gray-200/20">
                  {by(r.seasons, fSeason).slice(0, 15).map((s) => (
                    <div key={s.customerId} className="py-2">
                      {code(s.customerId, s.customerCode, s.customerName)}
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
            <SectionHead
              icon={<Lightbulb className="h-4 w-4 text-emerald-300" />}
              title="Cơ hội bán hàng mới trong 30 ngày"
              count={by(r.opportunities, fOpp).length}
              right={team && <EmployeeFilter members={r.members} value={fOpp} onChange={setFOpp} />}
            />
            {by(r.opportunities, fOpp).length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có.</p>
            ) : (
              <div className="divide-y divide-gray-200/20">
                {by(r.opportunities, fOpp).map((o, idx) => (
                  <div key={`${o.customerId}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      {code(o.customerId, o.customerCode, o.customerName)}
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
          {team && <SpotChecks canVerify={canVerify} onOpenCustomer={onOpenCustomer} />}
        </>
      )}
    </div>
  );
}

/** "Chi tiết chăm sóc": có ô chọn ngày RIÊNG (mặc định hôm nay), mỗi thành viên một cột nằm ngang. */
function DetailsSection({ team, onOpenCustomer }: { team: boolean; onOpenCustomer: (customerId: string) => void }) {
  const [date, setDate] = useState(todayYmd());
  const [filter, setFilter] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["care-details", date],
    queryFn: async () => {
      const res = await fetch(`/api/customer-care/team?section=details&date=${date}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được chi tiết chăm sóc");
      return json.details as CareDetailsReport;
    },
  });

  const cols = (data?.members ?? []).filter((m) => !filter || m.id === filter);
  const shown = cols.reduce((s, m) => s + m.logs, 0);

  return (
    <div className={card}>
      <SectionHead
        icon={<ClipboardList className="h-4 w-4 text-amber-400" />}
        title={`Chi tiết chăm sóc ${formatDateVN(data?.date ?? date)}`}
        count={data ? shown : undefined}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              max={todayYmd()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="rounded-lg border border-gray-200/40 bg-transparent px-2.5 py-1 text-xs text-ink"
              aria-label="Chọn ngày xem chi tiết chăm sóc"
            />
            {date !== todayYmd() && (
              <button onClick={() => setDate(todayYmd())} className="rounded-full border border-gray-200/40 px-2.5 py-0.5 text-xs text-ink2 hover:bg-white/5">
                Hôm nay
              </button>
            )}
            {team && data && <EmployeeFilter members={data.members} value={filter} onChange={setFilter} />}
          </div>
        }
      />
      {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {error && <p className="text-sm text-alert">{(error as Error).message}</p>}
      {data && (
        <div className="overflow-x-auto">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(230px, 1fr))` }}>
            {cols.map((m) => {
              const rows: CareDetail[] = data.details.filter((d) => d.employeeId === m.id);
              return (
                <div key={m.id} className="rounded-xl border border-gray-200/20 p-3">
                  <p className="mb-2 flex items-center justify-between border-b border-gray-200/20 pb-2 text-sm font-semibold text-ink">
                    {m.name}
                    <span className={cn("font-mono text-xs", rows.length === 0 ? "text-alert" : "text-emerald-300")}>{rows.length === 0 ? "Chưa ghi" : `${m.customers} khách`}</span>
                  </p>
                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có lần chăm sóc nào.</p>
                  ) : (
                    <div className="space-y-2">
                      {rows.map((d, i) => (
                        <div key={`${d.customerId}-${d.at}-${i}`} className="text-xs">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-muted-foreground">{hhmm(d.at)}</span>
                            <button onClick={() => onOpenCustomer(d.customerId)} title={d.customerName} className="shrink-0 font-mono text-sm font-semibold text-amber-400 underline-offset-2 hover:underline">
                              {d.customerCode}
                            </button>
                            <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", OUTCOME_TONE[d.outcome])}>{CARE_OUTCOME_LABEL[d.outcome as CareOutcomeKey] ?? d.outcome}</span>
                            <span className="text-[11px] text-muted-foreground">{CARE_CHANNEL_LABEL[d.channel as CareChannelKey] ?? d.channel}</span>
                          </div>
                          {(d.issueType || d.needGroup || d.expectedMonth || d.note) && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {d.issueType && <span className="text-alert">{ISSUE_TYPE_LABEL[d.issueType as keyof typeof ISSUE_TYPE_LABEL] ?? d.issueType}. </span>}
                              {d.needGroup && <span>{d.needGroup}{d.needValueBand ? ` · ${VALUE_BAND_LABEL[d.needValueBand as keyof typeof VALUE_BAND_LABEL] ?? d.needValueBand}` : ""}. </span>}
                              {d.expectedMonth && <span>Dự kiến T{d.expectedMonth}. </span>}
                              {d.note}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}