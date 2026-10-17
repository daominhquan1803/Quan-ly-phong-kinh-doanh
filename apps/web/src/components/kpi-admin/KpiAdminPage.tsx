"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatDateVN } from "@/lib/utils";

const DELAY_CATEGORIES: Record<string, string> = {
  SAN_XUAT: "Sản xuất",
  KE_HOACH: "Kế hoạch",
  KHACH_DOI_LICH: "Khách đổi lịch",
  VAN_CHUYEN: "Vận chuyển",
  ADMIN: "Lỗi Admin",
  KHAC: "Khác",
};
const CORRECTION_CAUSES: Record<string, string> = {
  ADMIN: "Lỗi Admin",
  SALES: "Kinh doanh",
  ACCOUNTING: "Kế toán",
  CUSTOMER: "Khách hàng",
  OTHER: "Khác",
};
const REASON_STATUS: Record<string, string> = { PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Không duyệt" };

interface Item { key: string; label: string; detail: string; score: number; max: number; manual?: boolean }
interface Metric { total?: number; onTime?: number; ok?: number; pct: number | null; points: number }
interface Week {
  weekIndex: number;
  label: string;
  started: boolean;
  completed: boolean;
  payments: Metric;
  slips: Metric;
  adminDefects: { count: number; points: number };
  deliveries: Metric & { lateCount: number };
  complaints: Metric;
  score: number;
  weekPoint: number;
}
interface Reason { id: string; category: string; note: string | null; status: "PENDING" | "APPROVED" | "REJECTED"; reviewNote: string | null }
interface LateLine {
  id: string;
  poCode: string;
  itemCode: string | null;
  itemName: string | null;
  customerCode: string | null;
  requestedDeliveryDate: string;
  poQuantity: number;
  poValue: number;
  events: { eventDate: string; quantity: number }[];
  reason: Reason | null;
  verdict: "ON_TIME" | "LATE" | "EXEMPT" | "NOT_DUE";
}
interface Correction {
  id: string;
  customerCode: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  kind: string;
  refs: string[];
  customerName: string | null;
  amount: string | number | null;
  cause: string | null;
  causeNote: string | null;
  causeSetBy: { name: string } | null;
}
interface Kpi {
  year: number;
  month: number;
  items: Item[];
  total: number;
  grade: string;
  label: string;
  weeks: Week[];
  lateLines: LateLine[];
  corrections: Correction[];
  manual: { documentsPct: string | number | null; attitudeScore: string | number | null; note: string | null } | null;
  ratings: { rater: string; raterId: string; score: number; comment: string | null }[];
}

const thisMonth = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
const money = (n: number | string | null) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("vi-VN"));
const pctText = (p: number | null) => (p === null ? "—" : `${p}%`);
const input = "text-sm bg-card text-ink rounded-xl border border-white/10 py-1.5 px-2.5 focus:outline-none focus:ring-1 focus:ring-amber-500";
const card = "glass-card border border-white/10 p-4";

async function send(method: string, url: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Có lỗi xảy ra");
  return json;
}

export function KpiAdminPage({ isAdmin, canEdit, isSystem, canRate }: { isAdmin: boolean; canEdit: boolean; isSystem: boolean; canRate: boolean }) {
  const [month, setMonth] = useState(thisMonth());
  const [adminId, setAdminId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <input type="month" className={input} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        {isAdmin && <AdminPicker month={month} adminId={adminId} onChange={setAdminId} />}
      </div>
      {canRate && <RatingPanel month={month} />}
      {isAdmin && <AdminKpiView month={month} adminId={adminId} canEdit={canEdit} isSystem={isSystem} />}
    </div>
  );
}

function useKpi(month: string, adminId: string | null) {
  return useQuery({
    queryKey: ["kpi-admin", month, adminId],
    queryFn: async () => {
      const p = new URLSearchParams({ month, ...(adminId ? { adminId } : {}) });
      const res = await fetch(`/api/kpi-admin?${p}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được KPI Admin");
      return json as { admins: { id: string; name: string }[]; adminId?: string; kpi: Kpi | null };
    },
  });
}

function AdminPicker({ month, adminId, onChange }: { month: string; adminId: string | null; onChange: (id: string) => void }) {
  const { data } = useKpi(month, adminId);
  if (!data || data.admins.length < 2) return data?.admins[0] ? <span className="text-sm text-ink">{data.admins[0].name}</span> : null;
  return (
    <select className={input} value={data.adminId ?? ""} onChange={(e) => onChange(e.target.value)}>
      {data.admins.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

function AdminKpiView({ month, adminId, canEdit, isSystem }: { month: string; adminId: string | null; canEdit: boolean; isSystem: boolean }) {
  const { data, isLoading, error } = useKpi(month, adminId);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["kpi-admin"] });

  if (isLoading) return <p className="text-sm text-muted2">Đang tính KPI Admin...</p>;
  if (error) return <p className="text-sm text-alert">{(error as Error).message}</p>;
  if (!data?.kpi) return <p className="text-sm text-muted2">Chưa có tài khoản Admin kinh doanh (quản trị mức Vận hành).</p>;
  const k = data.kpi;
  const targetAdmin = data.adminId!;

  return (
    <div className="space-y-6">
      <div className={cn(card, "flex flex-wrap items-center gap-6")}>
        <div>
          <p className="text-xs text-muted2">Tổng điểm tháng {k.month}/{k.year}</p>
          <p className="text-3xl font-bold text-amber-400">{k.total}<span className="text-base text-muted2">/100</span></p>
        </div>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-300">{k.label}</span>
        <p className="text-xs text-muted2">Tháng chạy thử — xem số liệu để điều chỉnh mốc trước khi áp dụng thưởng.</p>
      </div>

      <div className={cn(card, "overflow-x-auto")}>
        <h2 className="mb-3 text-sm font-bold text-ink">KPI tháng</h2>
        <table className="min-w-full text-xs">
          <thead className="text-muted2">
            <tr>
              <th className="py-1.5 text-left font-medium">#</th>
              <th className="py-1.5 text-left font-medium">Tiêu chí</th>
              <th className="py-1.5 text-left font-medium">Kết quả</th>
              <th className="py-1.5 text-right font-medium">Điểm</th>
              <th className="py-1.5 text-right font-medium">Tối đa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {k.items.map((i, idx) => (
              <tr key={i.key}>
                <td className="py-2 pr-2 text-muted2">{idx + 1}</td>
                <td className="py-2 pr-3 text-ink">{i.label}</td>
                <td className="py-2 pr-3 text-muted2">{i.detail}</td>
                <td className={cn("py-2 text-right font-mono font-semibold", i.score >= i.max ? "text-emerald-300" : i.score === 0 ? "text-alert" : "text-ink")}>{i.score}</td>
                <td className="py-2 text-right font-mono text-muted2">{i.max}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td />
              <td className="py-2 text-ink">Tổng</td>
              <td />
              <td className="py-2 text-right font-mono text-amber-400">{k.total}</td>
              <td className="py-2 text-right font-mono text-muted2">100</td>
            </tr>
          </tbody>
        </table>
        {isSystem && <ManualForm key={`${targetAdmin}-${month}`} adminId={targetAdmin} kpi={k} onSaved={refresh} />}
      </div>

      <div className={cn(card, "overflow-x-auto")}>
        <h2 className="mb-1 text-sm font-bold text-ink">KPI tuần</h2>
        <p className="mb-3 text-xs text-muted2">Tiền về D+1 25 · Phiếu 2 ngày 20 · Lỗi đơn do Admin 20 · Giao đúng hạn 20 · Khiếu nại 24h 15. Từ 80đ được 2 điểm tuần, 60–79đ được 1.</p>
        <table className="min-w-full text-xs">
          <thead className="text-muted2">
            <tr>
              <th className="py-1.5 text-left font-medium">Tuần</th>
              <th className="py-1.5 text-right font-medium">Tiền về D+1</th>
              <th className="py-1.5 text-right font-medium">Phiếu 2 ngày</th>
              <th className="py-1.5 text-right font-medium">Lỗi do Admin</th>
              <th className="py-1.5 text-right font-medium">Giao đúng hạn</th>
              <th className="py-1.5 text-right font-medium">Khiếu nại 24h</th>
              <th className="py-1.5 text-right font-medium">Điểm</th>
              <th className="py-1.5 text-right font-medium">Điểm tuần</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {k.weeks.map((w) => (
              <tr key={w.weekIndex} className={cn(!w.started && "opacity-40")}>
                <td className="py-2 pr-3 whitespace-nowrap text-ink">
                  {w.label}
                  {w.started && !w.completed && <span className="ml-1 text-amber-300">(đang chạy)</span>}
                </td>
                <WeekCell m={w.payments} detail={`${w.payments.onTime}/${w.payments.total}`} />
                <WeekCell m={w.slips} detail={`${w.slips.onTime}/${w.slips.total}`} />
                <td className="py-2 text-right font-mono">
                  {w.adminDefects.points} <span className="text-muted2">({w.adminDefects.count} BB)</span>
                </td>
                <WeekCell m={w.deliveries} detail={`${w.deliveries.lateCount} trễ`} />
                <WeekCell m={w.complaints} detail={`${w.complaints.ok}/${w.complaints.total}`} />
                <td className="py-2 text-right font-mono font-semibold text-ink">{w.score}</td>
                <td className="py-2 text-right font-mono font-bold text-amber-300">{w.started ? w.weekPoint : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LateLines lines={k.lateLines} canEdit={canEdit} isSystem={isSystem} onSaved={refresh} />
      <Corrections rows={k.corrections} canEdit={canEdit} onSaved={refresh} />

      <div className={card}>
        <h2 className="mb-2 text-sm font-bold text-ink">NVKD chấm mức hài lòng ({k.ratings.length})</h2>
        {k.ratings.length === 0 ? (
          <p className="text-xs text-muted2">Chưa có NVKD chấm tháng này.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {k.ratings.map((r) => (
              <li key={r.raterId}>
                <b className="text-ink">{r.rater}</b>: <span className="text-amber-300">{"★".repeat(r.score)}</span>
                <span className="text-muted2">{"★".repeat(5 - r.score)}</span> {r.comment && <span className="text-muted2">— {r.comment}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WeekCell({ m, detail }: { m: Metric; detail: string }) {
  return (
    <td className="py-2 text-right font-mono">
      {m.points} <span className="text-muted2">({pctText(m.pct)} · {detail})</span>
    </td>
  );
}

function ManualForm({ adminId, kpi, onSaved }: { adminId: string; kpi: Kpi; onSaved: () => void }) {
  const [docs, setDocs] = useState(kpi.manual?.documentsPct != null ? String(kpi.manual.documentsPct) : "");
  const [attitude, setAttitude] = useState(kpi.manual?.attitudeScore != null ? String(kpi.manual.attitudeScore) : "");
  const [note, setNote] = useState(kpi.manual?.note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await send("PUT", "/api/kpi-admin/manual", {
        adminId,
        year: kpi.year,
        month: kpi.month,
        documentsPct: docs === "" ? null : Number(docs),
        attitudeScore: attitude === "" ? null : Number(attitude),
        note: note || null,
      });
      setMsg("Đã lưu");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/5 pt-4">
      <label className="space-y-1 text-xs text-muted2">
        <span className="block">Hồ sơ đầy đủ (%)</span>
        <input type="number" min={0} max={100} className={cn(input, "w-28")} value={docs} onChange={(e) => setDocs(e.target.value)} />
      </label>
      <label className="space-y-1 text-xs text-muted2">
        <span className="block">Thái độ (0–5)</span>
        <input type="number" min={0} max={5} step={0.5} className={cn(input, "w-24")} value={attitude} onChange={(e) => setAttitude(e.target.value)} />
      </label>
      <label className="flex-1 space-y-1 text-xs text-muted2">
        <span className="block">Ghi chú</span>
        <input className={cn(input, "w-full")} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button disabled={busy} onClick={save} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50">
        Lưu chấm tay
      </button>
      {msg && <span className="text-xs text-muted2">{msg}</span>}
    </div>
  );
}

function LateLines({ lines, canEdit, isSystem, onSaved }: { lines: LateLine[]; canEdit: boolean; isSystem: boolean; onSaved: () => void }) {
  return (
    <div className={cn(card, "overflow-x-auto")}>
      <h2 className="mb-1 text-sm font-bold text-ink">Dòng PO giao trễ trong tháng ({lines.length})</h2>
      <p className="mb-3 text-xs text-muted2">Admin nhập lý do; trưởng phòng duyệt thì dòng đó không tính trễ (trừ lý do “Lỗi Admin”).</p>
      {lines.length === 0 ? (
        <p className="text-xs text-muted2">Không có dòng giao trễ.</p>
      ) : (
        <table className="min-w-full text-xs">
          <thead className="text-muted2">
            <tr>
              <th className="py-1.5 text-left font-medium">PO</th>
              <th className="py-1.5 text-left font-medium">Mặt hàng</th>
              <th className="py-1.5 text-left font-medium">Hạn giao</th>
              <th className="py-1.5 text-right font-medium">SL giao / PO</th>
              <th className="py-1.5 text-right font-medium">Giá trị</th>
              <th className="py-1.5 text-left font-medium pl-3">Lý do</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {lines.map((l) => (
              <LateLineRow key={l.id} l={l} canEdit={canEdit} isSystem={isSystem} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LateLineRow({ l, canEdit, isSystem, onSaved }: { l: LateLine; canEdit: boolean; isSystem: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(l.reason?.category ?? "");
  const [note, setNote] = useState(l.reason?.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const delivered = l.events.reduce((s, e) => s + Number(e.quantity), 0);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="align-top">
      <td className="py-2 pr-3 font-mono text-amber-400 whitespace-nowrap">
        {l.poCode}
        <p className="font-sans text-muted2">{l.customerCode}</p>
      </td>
      <td className="py-2 pr-3">
        <span className="font-mono text-muted2">{l.itemCode}</span> {l.itemName}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">{formatDateVN(l.requestedDeliveryDate)}</td>
      <td className="py-2 text-right font-mono whitespace-nowrap">
        {delivered.toLocaleString("vi-VN")} / {Number(l.poQuantity).toLocaleString("vi-VN")}
      </td>
      <td className="py-2 text-right font-mono">{money(l.poValue)}</td>
      <td className="py-2 pl-3 min-w-[260px]">
        {l.reason && !editing && (
          <div className="space-y-0.5">
            <p>
              <b className="text-ink">{DELAY_CATEGORIES[l.reason.category] ?? l.reason.category}</b>
              {l.reason.note && <span className="text-muted2"> — {l.reason.note}</span>}
            </p>
            <p
              className={cn(
                "font-semibold",
                l.reason.status === "APPROVED" ? "text-emerald-300" : l.reason.status === "REJECTED" ? "text-alert" : "text-amber-300"
              )}
            >
              {REASON_STATUS[l.reason.status]}
              {l.verdict === "EXEMPT" && " · không tính trễ"}
              {l.reason.reviewNote && <span className="font-normal text-muted2"> — {l.reason.reviewNote}</span>}
            </p>
          </div>
        )}
        {!l.reason && !editing && <p className="text-alert">Chưa có lý do — tính trễ</p>}
        {editing && (
          <div className="flex flex-wrap gap-2">
            <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">— Chọn lý do —</option>
              {Object.entries(DELAY_CATEGORIES).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <input className={cn(input, "flex-1 min-w-[140px]")} placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
            <button
              disabled={busy}
              onClick={() => run(() => send("POST", "/api/kpi-admin/delay-reasons", { lineId: l.id, category, note: note || null }))}
              className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
            >
              Lưu
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-white/10 px-3 py-1 text-xs text-muted2">
              Huỷ
            </button>
          </div>
        )}
        {!editing && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {canEdit && (
              <button onClick={() => setEditing(true)} className="rounded-lg border border-white/10 px-2 py-0.5 text-xs hover:bg-white/5">
                {l.reason ? "Sửa lý do" : "Nhập lý do"}
              </button>
            )}
            {isSystem && l.reason && l.reason.status !== "APPROVED" && (
              <button
                disabled={busy}
                onClick={() => run(() => send("PATCH", `/api/kpi-admin/delay-reasons/${l.reason!.id}`, { action: "approve" }))}
                className="rounded-lg border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-500/10"
              >
                Duyệt
              </button>
            )}
            {isSystem && l.reason && l.reason.status !== "REJECTED" && (
              <button
                disabled={busy}
                onClick={() => {
                  const reviewNote = prompt("Lý do không duyệt (có thể bỏ trống):");
                  if (reviewNote !== null) run(() => send("PATCH", `/api/kpi-admin/delay-reasons/${l.reason!.id}`, { action: "reject", reviewNote }));
                }}
                className="rounded-lg border border-red-500/30 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/10"
              >
                Không duyệt
              </button>
            )}
          </div>
        )}
        {err && <p className="mt-1 text-alert">{err}</p>}
      </td>
    </tr>
  );
}

function Corrections({ rows, canEdit, onSaved }: { rows: Correction[]; canEdit: boolean; onSaved: () => void }) {
  return (
    <div className={cn(card, "overflow-x-auto")}>
      <h2 className="mb-1 text-sm font-bold text-ink">Hoá đơn thay thế / điều chỉnh trong tháng ({rows.length})</h2>
      <p className="mb-3 text-xs text-muted2">Tự lấy khi nhập file hoá đơn AMIS. Chưa gán nguyên nhân = tính lỗi Admin.</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted2">Không có hoá đơn thay thế/điều chỉnh.</p>
      ) : (
        <table className="min-w-full text-xs">
          <thead className="text-muted2">
            <tr>
              <th className="py-1.5 text-left font-medium">Hoá đơn</th>
              <th className="py-1.5 text-left font-medium">Khách</th>
              <th className="py-1.5 text-left font-medium">Ngày</th>
              <th className="py-1.5 text-left font-medium">Loại</th>
              <th className="py-1.5 text-right font-medium">Số tiền</th>
              <th className="py-1.5 text-left font-medium pl-3">Nguyên nhân</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((c) => (
              <CorrectionRow key={c.id} c={c} canEdit={canEdit} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CorrectionRow({ c, canEdit, onSaved }: { c: Correction; canEdit: boolean; onSaved: () => void }) {
  const [cause, setCause] = useState(c.cause ?? "");
  const [note, setNote] = useState(c.causeNote ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = cause !== (c.cause ?? "") || note !== (c.causeNote ?? "");
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await send("PATCH", `/api/kpi-admin/corrections/${c.id}`, { cause: cause || null, causeNote: note || null });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr className="align-top">
      <td className="py-2 pr-3 font-mono text-amber-400">
        {c.invoiceNumber}
        {c.refs.length > 0 && <p className="font-sans text-muted2">thay/điều chỉnh {c.refs.join(", ")}</p>}
      </td>
      <td className="py-2 pr-3">
        {c.customerCode}
        {c.customerName && <p className="text-muted2">{c.customerName}</p>}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">{formatDateVN(c.invoiceDate)}</td>
      <td className="py-2 pr-3">{c.kind === "REPLACEMENT" ? "Thay thế" : c.kind === "ADJUSTMENT" ? "Điều chỉnh" : c.kind}</td>
      <td className="py-2 text-right font-mono">{money(c.amount)}</td>
      <td className="py-2 pl-3 min-w-[280px]">
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <select className={cn(input, !cause && "border-red-500/50")} value={cause} onChange={(e) => setCause(e.target.value)}>
              <option value="">Chưa gán (tính lỗi Admin)</option>
              {Object.entries(CORRECTION_CAUSES).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <input className={cn(input, "flex-1 min-w-[120px]")} placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
            {dirty && (
              <button disabled={busy} onClick={save} className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
                Lưu
              </button>
            )}
          </div>
        ) : (
          <p className={cn(!c.cause && "text-alert")}>
            {c.cause ? CORRECTION_CAUSES[c.cause] : "Chưa gán (tính lỗi Admin)"}
            {c.causeNote && <span className="text-muted2"> — {c.causeNote}</span>}
          </p>
        )}
        {c.causeSetBy && <p className="mt-0.5 text-muted2">Gán bởi {c.causeSetBy.name}</p>}
        {err && <p className="mt-1 text-alert">{err}</p>}
      </td>
    </tr>
  );
}

function RatingPanel({ month }: { month: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["kpi-admin-ratings", month],
    queryFn: async () => {
      const res = await fetch(`/api/kpi-admin/ratings?month=${month}`);
      if (!res.ok) throw new Error("Không tải được");
      return res.json() as Promise<{ admins: { id: string; name: string }[]; mine: { adminId: string; score: number; comment: string | null }[] }>;
    },
  });
  if (isLoading || !data) return <p className="text-sm text-muted2">Đang tải...</p>;
  if (data.admins.length === 0) return <p className="text-sm text-muted2">Chưa có Admin kinh doanh để chấm.</p>;
  return (
    <div className="space-y-3">
      {data.admins.map((a) => (
        <RatingCard
          key={`${a.id}-${month}`}
          month={month}
          admin={a}
          mine={data.mine.find((m) => m.adminId === a.id) ?? null}
          onSaved={() => qc.invalidateQueries({ queryKey: ["kpi-admin-ratings", month] })}
        />
      ))}
    </div>
  );
}

function RatingCard({
  month,
  admin,
  mine,
  onSaved,
}: {
  month: string;
  admin: { id: string; name: string };
  mine: { score: number; comment: string | null } | null;
  onSaved: () => void;
}) {
  const [score, setScore] = useState(mine?.score ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await send("POST", "/api/kpi-admin/ratings", { adminId: admin.id, month, score, comment: comment || null });
      setMsg("Đã lưu, cảm ơn bạn");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={cn(card, "space-y-3 max-w-xl")}>
      <p className="text-sm font-semibold text-ink">
        Mức hài lòng về hỗ trợ của {admin.name} — tháng {month.slice(5)}/{month.slice(0, 4)}
      </p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} onClick={() => setScore(s)} className={cn("text-2xl leading-none", s <= score ? "text-amber-400" : "text-white/20")} aria-label={`${s} sao`}>
            ★
          </button>
        ))}
      </div>
      <textarea className={cn(input, "w-full min-h-[60px]")} placeholder="Góp ý (không bắt buộc)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex items-center gap-3">
        <button disabled={busy || score === 0} onClick={save} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50">
          {mine ? "Chấm lại" : "Gửi đánh giá"}
        </button>
        {msg && <span className="text-xs text-muted2">{msg}</span>}
      </div>
    </div>
  );
}
