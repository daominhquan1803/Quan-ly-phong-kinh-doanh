"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2, UploadCloud, Info, Save } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";

type Metric = "NEW_CONTACT" | "NEW_MEETING" | "EXISTING_VISIT" | "NEW_CUSTOMER_SALE" | "NEW_QUOTE" | "BUSINESS_TRIP";
const METRICS: Metric[] = ["NEW_CONTACT", "NEW_MEETING", "EXISTING_VISIT", "NEW_CUSTOMER_SALE", "NEW_QUOTE", "BUSINESS_TRIP"];
const MANUAL_METRICS: Metric[] = ["NEW_CONTACT", "NEW_MEETING", "EXISTING_VISIT"];
const WEIGHT_TOTAL = 100;

const METRIC_LABEL: Record<Metric, string> = {
  NEW_CONTACT: "KH liên hệ mới",
  NEW_MEETING: "KH mới hẹn gặp được",
  EXISTING_VISIT: "KH cũ liên hệ thăm hỏi",
  NEW_CUSTOMER_SALE: "KH mới bán được hàng",
  NEW_QUOTE: "Báo giá mới",
  BUSINESS_TRIP: "Buổi đi công tác",
};
const METRIC_NOTE: Record<Metric, string> = {
  NEW_CONTACT: "Khách chưa từng mua, hoặc khách cũ dừng mua ≥ 1 năm tính từ đơn cuối — tự ghi danh sách bên dưới.",
  NEW_MEETING: "Khách chưa từng mua, hoặc khách cũ dừng mua ≥ 1 năm tính từ đơn cuối — tự ghi danh sách bên dưới.",
  EXISTING_VISIT: "Khách đang mua, hoặc dừng mua < 1 năm tính từ đơn cuối — tự ghi danh sách bên dưới.",
  NEW_CUSTOMER_SALE: "Tự động từ Đơn hàng — khách chưa từng mua, hoặc dừng mua ≥ 1 năm (đối chiếu toàn công ty).",
  NEW_QUOTE: "Tự động từ Báo giá — cần gán \"Mã Báo giá\" ở trang Nhân viên.",
  BUSINESS_TRIP: "Tự động từ Đăng ký đi công tác — mỗi ngày tính 1 buổi.",
};

interface Employee { id: string; name: string }
interface ReportCell { target: number; actual: number; weight: number; point: number }
interface ReportRow {
  employeeId: string;
  employeeName: string;
  metrics: Record<Metric, ReportCell>;
  totalTarget: number;
  totalActual: number;
  totalWeight: number;
  totalPoints: number;
  weekGrade: 0 | 1 | 2;
}
interface SummaryResponse { weekStart: string; rows: ReportRow[]; isAdmin: boolean }
interface ResultEntry {
  id: string;
  entryDate: string;
  customerName: string;
  address: string | null;
  content: string | null;
  productInterest: string | null;
}

// ---- "Tuần" riêng của Kế hoạch làm việc tuần — luôn đúng 4 tuần/tháng, không vắt qua tháng ----
// (bản JS thuần dùng ở client, khớp 1-1 với apps/web/src/lib/week-plan.ts phía server).

function firstMondayOnOrAfter(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function getMonthWeekRanges(year: number, month: number) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const m1 = firstMondayOnOrAfter(monthStart);
  const m2 = addDays(m1, 7);
  const m3 = addDays(m1, 14);
  const m4 = addDays(m1, 21);
  return [
    { weekIndex: 1 as const, start: monthStart, end: addDays(m2, -1) },
    { weekIndex: 2 as const, start: m2, end: addDays(m3, -1) },
    { weekIndex: 3 as const, start: m3, end: addDays(m4, -1) },
    { weekIndex: 4 as const, start: m4, end: monthEnd },
  ];
}
function findMonthWeek(d: Date) {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const ranges = getMonthWeekRanges(year, month);
  const key = new Date(year, d.getMonth(), d.getDate()).getTime();
  const match = ranges.find((r) => key >= r.start.getTime() && key <= r.end.getTime()) ?? ranges[0];
  return { ...match, year, month };
}
function startOfCurrentMonthWeek(d: Date): Date {
  return findMonthWeek(d).start;
}
function adjacentWeekStart(weekStart: Date, direction: 1 | -1): Date {
  const { year, month, weekIndex } = findMonthWeek(weekStart);
  let targetIndex = weekIndex + direction;
  let targetYear = year;
  let targetMonth = month;
  if (targetIndex < 1) {
    targetIndex = 4;
    targetMonth -= 1;
    if (targetMonth < 1) { targetMonth = 12; targetYear -= 1; }
  } else if (targetIndex > 4) {
    targetIndex = 1;
    targetMonth += 1;
    if (targetMonth > 12) { targetMonth = 1; targetYear += 1; }
  }
  return getMonthWeekRanges(targetYear, targetMonth)[targetIndex - 1].start;
}
function fmtDM(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function weekLabel(weekStart: Date): string {
  const { year, month, weekIndex, start, end } = findMonthWeek(weekStart);
  return `Tuần ${weekIndex} tháng ${month} (${fmtDM(start)} – ${fmtDM(end)}/${year})`;
}
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function pct(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Math.round((actual / target) * 100);
}
function barColor(p: number): string {
  if (p >= 100) return "bg-success-600";
  if (p >= 60) return "bg-amber-500";
  return "bg-brandRed-600";
}
function gradeBadge(g: 0 | 1 | 2): { label: string; cls: string } {
  if (g === 2) return { label: "Đạt", cls: "bg-success-600/10 text-success-600" };
  if (g === 1) return { label: "Cần cố gắng", cls: "bg-warning-500/10 text-warning-500" };
  return { label: "Không hoàn thành", cls: "bg-brandRed-50 text-brandRed-600" };
}

export function WeekPlanOverview({ isAdmin }: { isAdmin: boolean }) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  const [weekStart, setWeekStart] = useState(() => startOfCurrentMonthWeek(new Date()));
  const weekStartISO = weekStart.toISOString();

  const { data: employeesData } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ users: Employee[] }>;
    },
    enabled: isAdmin,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["week-plan-summary", weekStartISO],
    queryFn: async () => {
      const res = await fetch(`/api/week-plan/summary?weekStart=${encodeURIComponent(weekStartISO)}`);
      if (!res.ok) throw new Error("Không tải được báo cáo tiến độ");
      return res.json() as Promise<SummaryResponse>;
    },
  });

  const [entryEmployeeId, setEntryEmployeeId] = useState<string>("");
  useEffect(() => {
    if (isAdmin) {
      if (!entryEmployeeId && summary?.rows.length) setEntryEmployeeId(summary.rows[0].employeeId);
    } else if (currentUserId) {
      setEntryEmployeeId(currentUserId);
    }
  }, [isAdmin, currentUserId, summary, entryEmployeeId]);

  return (
    <div className="space-y-6">
      <WeekNav weekStart={weekStart} onChange={setWeekStart} />

      {isAdmin && (
        <TargetGrid
          weekStartISO={weekStartISO}
          rows={summary?.rows ?? []}
          isLoading={summaryLoading}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["week-plan-summary"] })}
        />
      )}

      <ProgressReport rows={summary?.rows ?? []} isLoading={summaryLoading} isAdmin={isAdmin} />

      <ResultEntrySection
        weekStart={weekStart}
        weekStartISO={weekStartISO}
        isAdmin={isAdmin}
        employees={employeesData?.users ?? []}
        entryEmployeeId={entryEmployeeId}
        onEmployeeChange={setEntryEmployeeId}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["week-plan-summary"] })}
      />
    </div>
  );
}

function WeekNav({ weekStart, onChange }: { weekStart: Date; onChange: (d: Date) => void }) {
  const isCurrent = toISODate(weekStart) === toISODate(startOfCurrentMonthWeek(new Date()));
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(adjacentWeekStart(weekStart, -1))}
          className="rounded-md border border-gray-200 p-1.5 text-ink2 hover:bg-gray-50"
          aria-label="Tuần trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="rounded-md border border-gray-200 bg-card px-4 py-1.5 text-sm font-semibold text-ink min-w-[260px] text-center">
          {weekLabel(weekStart)}
        </div>
        <button
          onClick={() => onChange(adjacentWeekStart(weekStart, 1))}
          className="rounded-md border border-gray-200 p-1.5 text-ink2 hover:bg-gray-50"
          aria-label="Tuần sau"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {!isCurrent && (
        <button
          onClick={() => onChange(startOfCurrentMonthWeek(new Date()))}
          className="text-xs font-medium text-amber-500 hover:underline"
        >
          Về tuần hiện tại
        </button>
      )}
    </div>
  );
}

// ---------------- Giao chỉ tiêu + trọng số tuần (ADMIN) ----------------

function TargetGrid({
  weekStartISO,
  rows,
  isLoading,
  onSaved,
}: {
  weekStartISO: string;
  rows: ReportRow[];
  isLoading: boolean;
  onSaved: () => void;
}) {
  const [targetEdits, setTargetEdits] = useState<Record<string, number>>({});
  const [weightEdits, setWeightEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setTargetEdits({});
    setWeightEdits({});
    setSavedMsg(null);
  }, [weekStartISO]);

  function targetFor(employeeId: string, metric: Metric): number {
    const key = `${employeeId}:${metric}`;
    return targetEdits[key] ?? rows.find((r) => r.employeeId === employeeId)?.metrics[metric]?.target ?? 0;
  }
  function weightFor(employeeId: string, metric: Metric): number {
    const key = `${employeeId}:${metric}`;
    return weightEdits[key] ?? rows.find((r) => r.employeeId === employeeId)?.metrics[metric]?.weight ?? 0;
  }
  function weightSumFor(employeeId: string): number {
    return METRICS.reduce((s, m) => s + weightFor(employeeId, m), 0);
  }

  async function handleSave() {
    if (Object.keys(targetEdits).length === 0 && Object.keys(weightEdits).length === 0) return;
    setSaving(true);
    setSavedMsg(null);
    // Chỉ gửi trọn bộ 6 mục cho NHỮNG NHÂN VIÊN thực sự có ô vừa sửa (không phải mọi người đang
    // hiển thị) — để API validate tổng trọng số = 100 đúng người đó, không chặn nhầm lưu vì các
    // nhân viên KHÁC (chưa từng đụng tới) đang có trọng số 0.
    const editedEmployeeIds = new Set(
      [...Object.keys(targetEdits), ...Object.keys(weightEdits)].map((key) => key.split(":")[0])
    );
    const targets = rows
      .filter((r) => editedEmployeeIds.has(r.employeeId))
      .flatMap((r) =>
        METRICS.map((m) => ({
          employeeId: r.employeeId,
          metric: m,
          targetValue: targetFor(r.employeeId, m),
          weight: weightFor(r.employeeId, m),
        }))
      );
    const res = await fetch("/api/week-plan/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: weekStartISO, targets }),
    });
    if (res.ok) {
      setTargetEdits({});
      setWeightEdits({});
      setSavedMsg("Đã lưu chỉ tiêu tuần.");
      onSaved();
    } else {
      const json = await res.json().catch(() => ({}));
      setSavedMsg(json.error ?? "Lưu chỉ tiêu thất bại");
    }
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-medium text-ink">Giao chỉ tiêu &amp; trọng số tuần</h2>
        <button
          onClick={handleSave}
          disabled={saving || (Object.keys(targetEdits).length === 0 && Object.keys(weightEdits).length === 0)}
          className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" /> Lưu chỉ tiêu
        </button>
      </div>
      <p className="text-xs text-muted2 mb-4">
        Có thể giao trước cho các tuần tương lai — chỉ Quản trị viên nhập được. Tổng 6 trọng số của mỗi người bắt buộc = 100.
      </p>
      {savedMsg && <p className="text-xs text-amber-500 mb-3">{savedMsg}</p>}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có nhân viên nào đủ điều kiện (cần gán Mã AMIS ở trang Nhân viên).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="font-medium px-3 py-2">Nhân viên</th>
                {METRICS.map((m) => (
                  <th key={m} colSpan={2} className="font-medium px-3 py-2 text-center border-l border-gray-100">
                    {METRIC_LABEL[m]}
                  </th>
                ))}
                <th className="font-medium px-3 py-2 text-center border-l border-gray-100">Tổng trọng số</th>
              </tr>
              <tr className="text-left text-[10px] text-muted2">
                <th></th>
                {METRICS.map((m) => (
                  <Fragment2 key={m}>
                    <th className="font-normal px-2 py-1 text-center border-l border-gray-100">Chỉ tiêu</th>
                    <th className="font-normal px-2 py-1 text-center">Trọng số</th>
                  </Fragment2>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const wSum = weightSumFor(r.employeeId);
                return (
                  <tr key={r.employeeId}>
                    <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{r.employeeName}</td>
                    {METRICS.map((m) => (
                      <Fragment2 key={m}>
                        <td className="px-2 py-2 text-center border-l border-gray-100">
                          <input
                            type="number"
                            min={0}
                            value={targetFor(r.employeeId, m)}
                            onChange={(e) =>
                              setTargetEdits((prev) => ({ ...prev, [`${r.employeeId}:${m}`]: Number(e.target.value) }))
                            }
                            className="w-14 text-center text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-1 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={weightFor(r.employeeId, m)}
                            onChange={(e) =>
                              setWeightEdits((prev) => ({ ...prev, [`${r.employeeId}:${m}`]: Number(e.target.value) }))
                            }
                            className="w-14 text-center text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-1 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </td>
                      </Fragment2>
                    ))}
                    <td className={cn("px-3 py-2 text-center font-semibold border-l border-gray-100", wSum === WEIGHT_TOTAL ? "text-success-600" : "text-brandRed-600")}>
                      {wSum}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Fragment không cần key riêng ngoài key trên phần tử cha — đặt tên khác "Fragment" của React để
// khỏi phải import thêm, dùng luôn React.Fragment qua JSX runtime tự động.
function Fragment2({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ---------------- Báo cáo tiến độ ----------------

function ProgressReport({ rows, isLoading, isAdmin }: { rows: ReportRow[]; isLoading: boolean; isAdmin: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-medium text-ink">Báo cáo tiến độ tuần</h2>
        <span className="text-xs text-muted2">Cập nhật theo thời gian thực</span>
      </div>
      <p className="text-xs text-muted2 mb-4">
        Điểm từng mục = tỉ lệ hoàn thành × trọng số. Tổng điểm tuần quy về Điểm tuần 0/1/2 (80-100 → Đạt, 60-79 → Cần
        cố gắng, dưới 60 → Không hoàn thành) — cộng dồn 4 tuần vào KPI tháng.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
      ) : (
        <div className="space-y-5">
          {rows.map((r) => {
            const badge = gradeBadge(r.weekGrade);
            return (
              <div key={r.employeeId}>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <p className="font-medium text-ink text-sm">{r.employeeName}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Tổng điểm: <span className="font-mono tabular-nums text-ink font-semibold">{r.totalPoints}</span>/100
                    </span>
                    <span className={cn("status-badge", badge.cls)}>Điểm tuần {r.weekGrade} — {badge.label}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {METRICS.map((m) => {
                    const cell = r.metrics[m];
                    const p = pct(cell.actual, cell.target);
                    return (
                      <div key={m} className="rounded-md border border-gray-200 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs text-muted-foreground truncate" title={METRIC_NOTE[m]}>
                            {METRIC_LABEL[m]}
                          </span>
                          <span className="text-xs font-mono tabular-nums font-semibold text-ink shrink-0">
                            {cell.actual}/{cell.target}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden mb-1">
                          <div className={cn("h-full rounded-full", barColor(p))} style={{ width: `${Math.min(p, 100)}%` }} />
                        </div>
                        <p className="text-[11px] text-muted2 text-right">
                          Trọng số {cell.weight} · Điểm <span className="font-mono">{cell.point}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Nhập kết quả (3 mục nhập tay) ----------------

function ResultEntrySection({
  weekStart,
  weekStartISO,
  isAdmin,
  employees,
  entryEmployeeId,
  onEmployeeChange,
  onChanged,
}: {
  weekStart: Date;
  weekStartISO: string;
  isAdmin: boolean;
  employees: Employee[];
  entryEmployeeId: string;
  onEmployeeChange: (id: string) => void;
  onChanged: () => void;
}) {
  const [metric, setMetric] = useState<Metric>("NEW_CONTACT");
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ entryDate: toISODate(new Date()), customerName: "", address: "", content: "", productInterest: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const enabled = !!entryEmployeeId;
  const { data, isLoading } = useQuery({
    queryKey: ["week-plan-results", weekStartISO, metric, entryEmployeeId],
    queryFn: async () => {
      const params = new URLSearchParams({ weekStart: weekStartISO, metric, employeeId: entryEmployeeId });
      const res = await fetch(`/api/week-plan/results?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách kết quả");
      return res.json() as Promise<{ entries: ResultEntry[] }>;
    },
    enabled,
  });
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["week-plan-results"] });
    onChanged();
  }

  async function handleAdd() {
    setError(null);
    if (!form.customerName.trim()) {
      setError("Thiếu tên khách hàng");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/week-plan/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStart: weekStartISO,
        metric,
        entryDate: form.entryDate,
        customerName: form.customerName,
        address: form.address || null,
        content: form.content || null,
        productInterest: form.productInterest || null,
        employeeId: isAdmin ? entryEmployeeId : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Không lưu được");
    } else {
      setForm({ entryDate: toISODate(new Date()), customerName: "", address: "", content: "", productInterest: "" });
      setShowForm(false);
      invalidate();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/week-plan/results/${id}`, { method: "DELETE" });
    invalidate();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h2 className="font-medium text-ink">Nhập kết quả — khách hàng đã liên hệ/gặp</h2>
        {isAdmin && employees.length > 0 && (
          <select
            value={entryEmployeeId}
            onChange={(e) => onEmployeeChange(e.target.value)}
            className="text-sm bg-card text-ink rounded-md border border-gray-200 py-1.5 px-2"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {MANUAL_METRICS.map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium",
              metric === m ? "bg-amber-500/10 text-amber-500 ring-1 ring-inset ring-amber-500/30" : "text-muted-foreground hover:bg-gray-50"
            )}
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted2 mb-4 flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        {METRIC_NOTE[metric]}
      </p>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => { setShowForm((v) => !v); setShowUpload(false); }}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-gray-50"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm dòng
        </button>
        <button
          onClick={() => { setShowUpload((v) => !v); setShowForm(false); }}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-gray-50"
        >
          <UploadCloud className="h-3.5 w-3.5" /> Tải Excel lên
        </button>
      </div>

      {showForm && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {error && <p className="text-xs text-brandRed-600 sm:col-span-2">{error}</p>}
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Ngày
            <input type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} className="input" />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Khách hàng
            <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} className="input" />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Địa chỉ
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="input" />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Sản phẩm quan tâm
            <input value={form.productInterest} onChange={(e) => setForm((f) => ({ ...f, productInterest: e.target.value }))} className="input" />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1 sm:col-span-2">
            Nội dung
            <input value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} className="input" />
          </label>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50 sm:col-span-2 w-fit"
          >
            Lưu dòng này
          </button>
        </div>
      )}

      {showUpload && (
        <UploadPanel
          isAdmin={isAdmin}
          employees={employees}
          defaultEmployeeId={entryEmployeeId}
          onDone={() => { setShowUpload(false); invalidate(); }}
        />
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="font-medium px-2 py-1.5">Ngày</th>
              <th className="font-medium px-2 py-1.5">Khách hàng</th>
              <th className="font-medium px-2 py-1.5">Địa chỉ</th>
              <th className="font-medium px-2 py-1.5">Nội dung</th>
              <th className="font-medium px-2 py-1.5">SP quan tâm</th>
              <th className="font-medium px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">Đang tải...</td>
              </tr>
            )}
            {!isLoading && (data?.entries.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">Chưa có dòng nào trong tuần này.</td>
              </tr>
            )}
            {data?.entries.map((e) => (
              <tr key={e.id}>
                <td className="px-2 py-1.5 text-ink2 whitespace-nowrap">{formatDateVN(e.entryDate)}</td>
                <td className="px-2 py-1.5 text-ink font-medium">{e.customerName}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{e.address ?? "—"}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{e.content ?? "—"}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{e.productInterest ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  <button onClick={() => handleDelete(e.id)} className="text-muted2 hover:text-brandRed-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UploadPanel({
  isAdmin,
  employees,
  defaultEmployeeId,
  onDone,
}: {
  isAdmin: boolean;
  employees: Employee[];
  defaultEmployeeId: string;
  onDone: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ createdCount: number; errorCount: number; errors: { rowNumber: number; message: string }[] } | null>(null);

  useEffect(() => setEmployeeId(defaultEmployeeId), [defaultEmployeeId]);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    if (isAdmin) formData.append("employeeId", employeeId);
    const res = await fetch("/api/week-plan/results/import", { method: "POST", body: formData });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setResult(json);
      onDone();
    } else {
      setResult({ createdCount: 0, errorCount: 1, errors: [{ rowNumber: 0, message: json.error ?? "Tải file thất bại" }] });
    }
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 mb-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        File cần đúng cấu trúc sheet &quot;KẾT QUẢ&quot; trong file mẫu (STT, Mục, Ngày tháng, Khách hàng, Địa chỉ, Nội dung, Sản phẩm quan tâm) —
        1 file có thể chứa cả 3 mục, mỗi dòng tự xếp đúng tuần theo Ngày tháng.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {isAdmin && employees.length > 0 && (
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="text-sm bg-card text-ink rounded-md border border-gray-200 py-1.5 px-2">
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs text-muted-foreground" />
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50"
        >
          {loading ? "Đang tải..." : "Tải lên"}
        </button>
      </div>
      {result && (
        <div className="text-xs">
          <p className="text-ink">
            Đã thêm <span className="font-mono">{result.createdCount}</span> dòng
            {result.errorCount > 0 && <span className="text-brandRed-600"> — {result.errorCount} dòng lỗi</span>}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-brandRed-600">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>Dòng {e.rowNumber}: {e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
