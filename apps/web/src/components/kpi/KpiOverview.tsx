"use client";

import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { Pencil, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface KpiRow {
  employeeId: string;
  employeeName: string;
  targetRevenue: number;
  actualRevenue: number;
  weightRevenue: number;
  revenuePct: number | null;
  scoreRevenue: number;
  revenueBonus: number;
  targetRevenueSX: number;
  actualRevenueSX: number;
  weightRevenueSX: number;
  revenueSXPct: number | null;
  scoreSX: number;
  revenueSXBonus: number;
  targetNewCustomers: number | null;
  actualNewCustomers: number | null;
  weightNewCustomers: number;
  scoreNewCustomers: number;
  debtOverduePct: number | null;
  scoreDebtOverdue: number;
  debtCollectionRatePct: number | null;
  scoreDebtCollection: number;
  visitTarget: number;
  approvedVisitCount: number;
  weightVisit: number;
  scoreVisit: number;
  violationCount: number;
  scoreAttitude: number;
  scoreWeek: number;
  totalScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  gradeLabel: string;
  bonusSuggestion: string;
}

interface DefectRow {
  id: string;
  reportNumber: string;
  employee: { id: string; name: string };
  reportDate: string;
  description: string;
  createdBy: { name: string };
}

interface EmployeeOption {
  id: string;
  name: string;
}

const GRADE_STYLE: Record<KpiRow["grade"], string> = {
  A: "bg-success-600/10 text-success-600",
  B: "bg-info-500/10 text-info-500",
  C: "bg-gold-500/10 text-gold-500",
  D: "bg-warning-500/10 text-warning-500",
  F: "bg-brandRed-50 text-brandRed-600",
};

function pct(n: number | null): string {
  return n != null ? `${Math.round(n * 100)}%` : "—";
}

// debtOverduePct/debtCollectionRatePct đã lưu sẵn dạng số nguyên phần trăm (vd 25 = 25%) —
// chỉ hiện thêm "%", không nhân 100 như pct() ở trên.
function pctRaw(n: number | null): string {
  return n != null ? `${n}%` : "—";
}

function numOrDash(n: number | null): string {
  return n != null ? String(n) : "—";
}

export function KpiOverview({ isAdmin }: { isAdmin: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDefects, setShowDefects] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["kpi-report", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/kpi/report?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Không tải được báo cáo KPI");
      return res.json() as Promise<{ rows: KpiRow[] }>;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              Tháng {m}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2">
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-muted-foreground">
            <tr>
              <th rowSpan={2} className="text-left font-medium px-3 py-2 align-bottom">Nhân viên</th>
              <th colSpan={3} className="text-center font-medium px-3 py-1.5 border-l border-gray-200" title="Trọng số do Quản trị viên tự phân bổ riêng từng người, mặc định 30">Doanh số tổng</th>
              <th colSpan={4} className="text-center font-medium px-3 py-1.5 border-l border-gray-200" title="Tỷ lệ đạt chỉ tiêu doanh số riêng nhóm hàng Sản xuất — lấy từ Kế hoạch kinh doanh. Trọng số mặc định 20">DS ngành Sản xuất</th>
              <th colSpan={4} className="text-center font-medium px-3 py-1.5 border-l border-gray-200" title="Trọng số mặc định 10">KH mới</th>
              <th colSpan={3} className="text-center font-medium px-3 py-1.5 border-l border-gray-200" title="Trọng số mặc định 10 — không còn trừ điểm hàng lỗi">CSKH / Đi gặp KH</th>
              <th colSpan={4} className="text-center font-medium px-3 py-1.5 border-l border-gray-200">Công nợ (20đ)</th>
              <th colSpan={2} className="text-center font-medium px-3 py-1.5 border-l border-gray-200" title="max(2 − số lần vi phạm, 0)">Thái độ (2đ)</th>
              <th rowSpan={2} className="text-right font-medium px-3 py-2 border-l border-gray-200 align-bottom" title="Tổng điểm 0/1/2 của 4 tuần trong tháng, từ Kế hoạch làm việc tuần">Điểm tuần (8đ)</th>
              <th colSpan={3} className="text-center font-medium px-3 py-1.5 border-l border-gray-200">Tổng hợp</th>
              {isAdmin && <th rowSpan={2} className="px-3 py-2 align-bottom"></th>}
            </tr>
            <tr>
              <th className="text-right font-normal px-3 py-1.5 border-l border-gray-200">%</th>
              <th className="text-right font-normal px-3 py-1.5">Trọng số</th>
              <th className="text-right font-normal px-3 py-1.5">Điểm</th>
              <th className="text-right font-normal px-3 py-1.5 border-l border-gray-200">Chỉ tiêu</th>
              <th className="text-right font-normal px-3 py-1.5">Thực tế</th>
              <th className="text-right font-normal px-3 py-1.5">Trọng số</th>
              <th className="text-right font-normal px-3 py-1.5">Điểm</th>
              <th className="text-right font-normal px-3 py-1.5 border-l border-gray-200">Chỉ tiêu</th>
              <th className="text-right font-normal px-3 py-1.5">Thực tế</th>
              <th className="text-right font-normal px-3 py-1.5">Trọng số</th>
              <th className="text-right font-normal px-3 py-1.5">Điểm</th>
              <th className="text-right font-normal px-3 py-1.5 border-l border-gray-200">Đi gặp KH</th>
              <th className="text-right font-normal px-3 py-1.5">Trọng số</th>
              <th className="text-right font-normal px-3 py-1.5">Điểm</th>
              <th className="text-right font-normal px-3 py-1.5 border-l border-gray-200">Quá hạn</th>
              <th className="text-right font-normal px-3 py-1.5">Điểm</th>
              <th className="text-right font-normal px-3 py-1.5">Thu hồi</th>
              <th className="text-right font-normal px-3 py-1.5">Điểm</th>
              <th className="text-right font-normal px-3 py-1.5 border-l border-gray-200">Vi phạm</th>
              <th className="text-right font-normal px-3 py-1.5">Điểm</th>
              <th className="text-right font-normal px-3 py-1.5 border-l border-gray-200">Điểm tổng</th>
              <th className="text-center font-normal px-3 py-1.5">Xếp loại</th>
              <th className="text-left font-normal px-3 py-1.5">Đề xuất thưởng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={24} className="px-4 py-6 text-center text-muted-foreground">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && (data?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={24} className="px-4 py-6 text-center text-muted-foreground">
                  Chưa có dữ liệu nhân viên.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <Fragment key={r.employeeId}>
                <tr className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{r.employeeName}</td>
                  <td
                    className="px-3 py-2 text-right border-l border-gray-100"
                    title={`${formatCurrencyVND(r.actualRevenue)} / ${formatCurrencyVND(r.targetRevenue)}`}
                  >
                    {pct(r.revenuePct)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{r.weightRevenue}</td>
                  <td
                    className="px-3 py-2 text-right font-medium"
                    title={r.revenueBonus > 0 ? `Có thưởng vượt chỉ tiêu: +${r.revenueBonus}đ (đạt ${Math.round((r.revenuePct ?? 0) * 100)}% chỉ tiêu, từ 110% cứ mỗi 5% vượt thêm +1đ)` : undefined}
                  >
                    {r.scoreRevenue}
                    {r.revenueBonus > 0 && <span className="text-success-600 font-normal"> (+{r.revenueBonus})</span>}
                  </td>
                  <td className="px-3 py-2 text-right border-l border-gray-100">
                    {r.targetRevenueSX > 0 ? formatCurrencyVND(r.targetRevenueSX) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right" title={r.revenueSXPct != null ? `Đạt ${Math.round(r.revenueSXPct * 100)}% chỉ tiêu` : undefined}>
                    {formatCurrencyVND(r.actualRevenueSX)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{r.weightRevenueSX}</td>
                  <td
                    className="px-3 py-2 text-right font-medium"
                    title={r.revenueSXBonus > 0 ? `Có thưởng vượt chỉ tiêu: +${r.revenueSXBonus}đ (đạt ${Math.round((r.revenueSXPct ?? 0) * 100)}% chỉ tiêu, từ 110% cứ mỗi 5% vượt thêm +1đ)` : undefined}
                  >
                    {r.scoreSX}
                    {r.revenueSXBonus > 0 && <span className="text-success-600 font-normal"> (+{r.revenueSXBonus})</span>}
                  </td>
                  <td className="px-3 py-2 text-right border-l border-gray-100">{numOrDash(r.targetNewCustomers)}</td>
                  <td className="px-3 py-2 text-right">{numOrDash(r.actualNewCustomers)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{r.weightNewCustomers}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.scoreNewCustomers}</td>
                  <td className="px-3 py-2 text-right border-l border-gray-100">
                    {r.approvedVisitCount}/{r.visitTarget}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{r.weightVisit}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.scoreVisit}</td>
                  <td className="px-3 py-2 text-right border-l border-gray-100">{pctRaw(r.debtOverduePct)}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.scoreDebtOverdue}</td>
                  <td className="px-3 py-2 text-right">{pctRaw(r.debtCollectionRatePct)}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.scoreDebtCollection}</td>
                  <td className="px-3 py-2 text-right border-l border-gray-100">{r.violationCount}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.scoreAttitude}</td>
                  <td className="px-3 py-2 text-right border-l border-gray-100 font-medium">{r.scoreWeek}</td>
                  <td className="px-3 py-2 text-right border-l border-gray-100 font-bold text-ink">{r.totalScore}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("status-badge", GRADE_STYLE[r.grade])}>{r.gradeLabel}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.bonusSuggestion}</td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setEditingId(editingId === r.employeeId ? null : r.employeeId)}
                        className="text-muted2 hover:text-ink"
                        title="Sửa chỉ tiêu KPI"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
                {isAdmin && editingId === r.employeeId && (
                  <tr>
                    <td colSpan={24} className="bg-navy-50/40 px-4 py-4">
                      <KpiEditForm
                        row={r}
                        year={year}
                        month={month}
                        onSaved={() => {
                          setEditingId(null);
                          queryClient.invalidateQueries({ queryKey: ["kpi-report", year, month] });
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted2">
        Doanh số &amp; DS ngành Sản xuất lấy tự động từ Kế hoạch kinh doanh — đạt từ 110% chỉ tiêu trở
        lên, cứ mỗi 5% vượt thêm được cộng 1đ thưởng, không giới hạn trần. Trọng số 4 mục Doanh số/DS
        SX/KH mới/CSKH do Quản trị viên tự phân bổ riêng từng người (tổng luôn = 70). Điểm &quot;Đi gặp
        KH&quot; tự tính theo số lượt đăng ký đi công tác đã được duyệt trong tháng. Điểm tuần tự cộng từ
        Kế hoạch làm việc tuần. Các ô còn lại do Quản trị viên nhập.
      </p>

      {isAdmin && (
        <div className="rounded-lg border border-gray-200 bg-card">
          <button
            onClick={() => setShowDefects((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink"
          >
            Biên bản hàng lỗi tháng {month}/{year}
            {showDefects ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showDefects && <DefectsPanel year={year} month={month} />}
        </div>
      )}
    </div>
  );
}

function KpiEditForm({
  row,
  year,
  month,
  onSaved,
  onCancel,
}: {
  row: KpiRow;
  year: number;
  month: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Record<string, number | "">>({
    weightRevenue: row.weightRevenue,
    weightRevenueSX: row.weightRevenueSX,
    weightNewCustomers: row.weightNewCustomers,
    weightVisit: row.weightVisit,
    targetNewCustomers: row.targetNewCustomers ?? "",
    actualNewCustomers: row.actualNewCustomers ?? "",
    debtOverduePct: row.debtOverduePct ?? "",
    debtCollectionRatePct: row.debtCollectionRatePct ?? "",
    visitTarget: row.visitTarget,
    violationCount: row.violationCount,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weightSum =
    Number(form.weightRevenue || 0) +
    Number(form.weightRevenueSX || 0) +
    Number(form.weightNewCustomers || 0) +
    Number(form.weightVisit || 0);

  function field(key: keyof typeof form, label: string, opts?: { step?: string }) {
    return (
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {label}
        <input
          type="number"
          step={opts?.step ?? "1"}
          value={form[key]}
          onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value === "" ? "" : Number(e.target.value) }))}
          className="bg-card text-ink rounded-md border border-gray-200 py-1.5 px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </label>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/kpi/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: row.employeeId,
          year,
          month,
          weightRevenue: Number(form.weightRevenue) || 0,
          weightRevenueSX: Number(form.weightRevenueSX) || 0,
          weightNewCustomers: Number(form.weightNewCustomers) || 0,
          weightVisit: Number(form.weightVisit) || 0,
          targetNewCustomers: form.targetNewCustomers === "" ? null : Number(form.targetNewCustomers),
          actualNewCustomers: form.actualNewCustomers === "" ? null : Number(form.actualNewCustomers),
          debtOverduePct: form.debtOverduePct === "" ? null : Number(form.debtOverduePct),
          debtCollectionRatePct: form.debtCollectionRatePct === "" ? null : Number(form.debtCollectionRatePct),
          visitTarget: Number(form.visitTarget) || 8,
          violationCount: form.violationCount === "" ? 0 : Number(form.violationCount),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Lưu thất bại");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">Sửa chỉ tiêu KPI — {row.employeeName}</p>
      <div>
        <p className={cn("text-xs mb-1.5", weightSum === 70 ? "text-muted-foreground" : "text-brandRed-600 font-medium")}>
          Tổng 4 trọng số bên dưới: {weightSum} (bắt buộc = 70)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {field("weightRevenue", "Trọng số Doanh số tổng")}
          {field("weightRevenueSX", "Trọng số DS ngành SX")}
          {field("weightNewCustomers", "Trọng số KH mới")}
          {field("weightVisit", "Trọng số CSKH/Đi gặp KH")}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {field("targetNewCustomers", "Chỉ tiêu KH mới")}
        {field("actualNewCustomers", "Thực tế KH mới")}
        {field("debtOverduePct", "Công nợ quá hạn (%)", { step: "0.1" })}
        {field("debtCollectionRatePct", "Tỷ lệ thu hồi nợ (%)", { step: "0.1" })}
        {field("visitTarget", "Chỉ tiêu lượt đi gặp KH/tháng")}
        {field("violationCount", "Vi phạm nội quy (lần)")}
      </div>
      {error && <p className="text-xs text-brandRed-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-ink">
          Huỷ
        </button>
      </div>
    </div>
  );
}

function DefectsPanel({ year, month }: { year: number; month: number }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ reportNumber: "", employeeId: "", reportDate: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["kpi-defects", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/kpi/defects?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Không tải được");
      return res.json() as Promise<{ defects: DefectRow[] }>;
    },
  });

  const { data: employeesData } = useQuery({
    queryKey: ["admin-users-for-defects"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Không tải được");
      return res.json() as Promise<{ users: EmployeeOption[] }>;
    },
  });

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/kpi/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Lưu thất bại");
      }
      setForm({ reportNumber: "", employeeId: "", reportDate: "", description: "" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["kpi-defects", year, month] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/kpi/defects/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["kpi-defects", year, month] });
  }

  return (
    <div className="border-t border-gray-200 px-4 py-3 space-y-3">
      <p className="text-xs text-muted2">
        Chỉ để ghi nhận/theo dõi — không còn dùng để trừ điểm KPI CSKH nữa.
      </p>
      <button
        onClick={() => setShowForm((v) => !v)}
        className="rounded-md bg-brandRed-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brandRed-700"
      >
        {showForm ? "Đóng" : "+ Thêm biên bản hàng lỗi"}
      </button>

      {showForm && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            placeholder="Số biên bản hàng lỗi"
            value={form.reportNumber}
            onChange={(e) => setForm((p) => ({ ...p, reportNumber: e.target.value }))}
            className="bg-card text-ink rounded-md border border-gray-200 py-1.5 px-2 text-sm"
          />
          <select
            value={form.employeeId}
            onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}
            className="bg-card text-ink rounded-md border border-gray-200 py-1.5 px-2 text-sm"
          >
            <option value="">— Chọn NVKD chịu trách nhiệm —</option>
            {employeesData?.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.reportDate}
            onChange={(e) => setForm((p) => ({ ...p, reportDate: e.target.value }))}
            className="bg-card text-ink rounded-md border border-gray-200 py-1.5 px-2 text-sm"
          />
          <input
            placeholder="Nội dung lỗi"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="bg-card text-ink rounded-md border border-gray-200 py-1.5 px-2 text-sm sm:col-span-2"
          />
          {error && <p className="text-xs text-brandRed-600 sm:col-span-2">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50 sm:col-span-2 w-fit"
          >
            {saving ? "Đang lưu..." : "Lưu biên bản"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-2 py-1.5">Số biên bản</th>
              <th className="text-left font-medium px-2 py-1.5">NVKD</th>
              <th className="text-left font-medium px-2 py-1.5">Ngày</th>
              <th className="text-left font-medium px-2 py-1.5">Nội dung lỗi</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data?.defects.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                  Chưa có biên bản hàng lỗi tháng này.
                </td>
              </tr>
            )}
            {data?.defects.map((d) => (
              <tr key={d.id}>
                <td className="px-2 py-1.5 font-medium text-ink">{d.reportNumber}</td>
                <td className="px-2 py-1.5">{d.employee.name}</td>
                <td className="px-2 py-1.5">{formatDateVN(d.reportDate)}</td>
                <td className="px-2 py-1.5">{d.description}</td>
                <td className="px-2 py-1.5">
                  <button onClick={() => handleDelete(d.id)} className="text-muted2 hover:text-brandRed-600">
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
