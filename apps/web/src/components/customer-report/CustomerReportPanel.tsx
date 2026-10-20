"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, Search, X } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import { INDUSTRIES, STAFF_SIZES, STAGES, STATUSES, type StageKey, type StatusKey } from "@/lib/customer-profile";
import { PRODUCT_GROUPS, GROUP_KEYS, type GroupKey } from "@/lib/product-groups";
import type { CustomerReport, CustomerReportRow } from "@/lib/customer-report";
import type { ImportChange } from "@/lib/customer-report-import";
import { ProfileForm } from "./ProfileForm";

const card = "rounded-2xl border border-gray-200/30 p-4";
const sel = "rounded-lg border border-gray-200/40 bg-card px-2.5 py-1.5 text-xs text-ink";
const money = (n: number) => (n > 0 ? `${Math.round(n / 1e6).toLocaleString("vi-VN")} tr` : "—");
const pctTone = (p: number | null) => (p == null ? "text-muted-foreground" : p >= 90 ? "text-emerald-300" : p >= 70 ? "text-amber-400" : "text-alert");
const STATUS_TONE: Record<StatusKey, string> = {
  LOST: "text-alert",
  RISK: "text-alert",
  SLEEP: "text-amber-400",
  NEW: "text-sky-300",
  ACTIVE: "text-emerald-300",
  INACTIVE: "text-muted-foreground",
  NEVER: "text-muted-foreground",
};
const FIELD_LABEL: Record<string, string> = {
  address: "Địa chỉ",
  province: "Tỉnh",
  industry: "Ngành",
  staffSize: "Quy mô",
  ownership: "Loại hình",
  contactPerson: "Người liên hệ",
  contactPhone: "SĐT",
  potentialYear: "Tiềm năng/năm",
  competitors: "Đối thủ",
  stage: "Tiến trình",
  painPoint: "Khó khăn",
};
const PAGE = 100;

/** Báo cáo Danh sách khách hàng: lọc cả phòng / từng NVKD, sửa hồ sơ ngay trên dòng, tải / nhập lại Excel. */
export function CustomerReportPanel({ isAdmin, canFixGroups }: { isAdmin: boolean; canFixGroups: boolean }) {
  const [employee, setEmployee] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-report", employee],
    queryFn: async () => {
      const res = await fetch(`/api/customer-report${employee ? `?employee=${employee}` : ""}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được báo cáo");
      return json as { scope: "TEAM" | "SELF"; report: CustomerReport };
    },
  });
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [industry, setIndustry] = useState("");
  const [group, setGroup] = useState("");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("");
  const [province, setProvince] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => data?.report.rows ?? [], [data]);
  const provinces = useMemo(() => [...new Set(rows.map((r) => r.province).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const filtered = useMemo(() => {
    const nq = normalizeVN(q.trim());
    return rows
      .filter((r) => showAll || r.orders12 > 0 || !!r.stage || !!r.industry || r.stageSuggested === "QUOTED")
      .filter((r) => !nq || normalizeVN(r.customerName).includes(nq) || normalizeVN(r.customerCode).includes(nq))
      .filter((r) => !tier || (tier === "NONE" ? !r.tier : r.tier === tier))
      .filter((r) => !industry || (industry === "NONE" ? !r.industry : r.industry === industry))
      .filter((r) => !group || (r.groups[group as GroupKey] ?? 0) > 0)
      .filter((r) => !stage || r.stageEffective === stage)
      .filter((r) => !status || r.status === status)
      .filter((r) => !province || r.province === province)
      .sort((a, b) => b.value12 - a.value12);
  }, [rows, q, tier, industry, group, stage, status, province, showAll]);

  const exportUrl = `/api/customer-report/export?${new URLSearchParams({ ...(employee ? { employee } : {}), ...(showAll ? { all: "1" } : {}) })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {data?.scope === "TEAM" && (
          <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={sel} aria-label="Phạm vi">
            <option value="">Cả phòng</option>
            {data.report.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Tìm mã / tên khách" className={cn(sel, "w-48 pl-8")} />
        </div>
        <select value={tier} onChange={(e) => setTier(e.target.value)} className={sel} aria-label="Hạng">
          <option value="">Mọi hạng</option>
          {["A", "B", "C", "NGU"].map((t) => (
            <option key={t} value={t}>
              Hạng {t === "NGU" ? "Ngủ" : t}
            </option>
          ))}
          <option value="NONE">Ngoài lịch</option>
        </select>
        <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={sel} aria-label="Ngành">
          <option value="">Mọi ngành</option>
          {Object.entries(INDUSTRIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          <option value="NONE">(chưa nhập ngành)</option>
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={sel} aria-label="Nhóm sản phẩm">
          <option value="">Mọi nhóm SP</option>
          {GROUP_KEYS.map((g) => (
            <option key={g} value={g}>
              {PRODUCT_GROUPS[g]}
            </option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={sel} aria-label="Tiến trình">
          <option value="">Mọi tiến trình</option>
          {Object.entries(STAGES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} aria-label="Tình trạng">
          <option value="">Mọi tình trạng</option>
          {Object.entries(STATUSES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={province} onChange={(e) => setProvince(e.target.value)} className={sel} aria-label="Tỉnh">
          <option value="">Mọi tỉnh</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Cả khách không mua 12 tháng
        </label>
        <div className="ml-auto flex gap-2">
          <a href={exportUrl} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black">
            <Download className="h-3.5 w-3.5" /> Tải Excel
          </a>
          <ImportButton />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Đang tổng hợp danh sách khách (khoảng vài giây)...</p>}
      {error && <p className="text-sm text-alert">{(error as Error).message}</p>}

      {data && (
        <>
          <div className={cn(card, "overflow-x-auto")}>
            <p className="mb-2 text-sm font-semibold text-ink">Hồ sơ khách theo NVKD</p>
            <table className="min-w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-medium">NVKD</th>
                  <th className="py-1 text-right font-medium">Hồ sơ khách</th>
                  <th className="py-1 text-right font-medium">Đang mua 12 tháng</th>
                  <th className="py-1 text-right font-medium">Khách A/B</th>
                  <th className="py-1 text-right font-medium" title="Chỉ tiêu KPI từ 12/2026: dưới 90% trừ 2đ, dưới 70% trừ 5đ">% hồ sơ khách A/B</th>
                  <th className="py-1 text-right font-medium">% hồ sơ khách đang mua</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.report.summary.map((s) => (
                  <tr key={s.employeeId ?? "none"}>
                    <td className="py-1.5 font-medium text-ink">{s.name}</td>
                    <td className="py-1.5 text-right font-mono">{s.customers}</td>
                    <td className="py-1.5 text-right font-mono">{s.active}</td>
                    <td className="py-1.5 text-right font-mono">{s.abCustomers}</td>
                    <td className={cn("py-1.5 text-right font-mono font-semibold", pctTone(s.abPct))}>{s.abPct == null ? "—" : `${s.abPct}%`}</td>
                    <td className={cn("py-1.5 text-right font-mono", pctTone(s.allPct))}>{s.allPct == null ? "—" : `${s.allPct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Số liệu đơn hàng trong app có từ 01/04/2026 (đồng bộ AMIS), nên “doanh số 12 tháng” hiện là từ 4/2026 và khách mua trước đó hiện “Chưa có đơn”. Hồ sơ đầy đủ = có địa chỉ, ngành, quy mô, loại hình, người liên hệ + SĐT, tiến trình đã xác nhận, tiềm năng/năm. Từ 12/2026 % hồ sơ khách A/B tính vào KPI tháng NVKD.
              {data.report.prevSnapshot && ` So sánh tiến trình với cuối tháng ${data.report.prevSnapshot.month}/${data.report.prevSnapshot.year}.`}
            </p>
          </div>

          <div className={cn(card, "overflow-x-auto")}>
            <p className="mb-2 text-sm font-semibold text-ink">
              Danh sách khách ({filtered.length}){" "}
              <span className="font-normal text-muted-foreground">· doanh số 12 tháng {money(filtered.reduce((s, r) => s + r.value12, 0))}</span>
            </p>
            <table className="min-w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left font-medium">Khách hàng</th>
                  {data.scope === "TEAM" && <th className="py-1.5 text-left font-medium">NVKD</th>}
                  <th className="py-1.5 text-left font-medium">Hạng</th>
                  <th className="py-1.5 text-left font-medium">Ngành / quy mô</th>
                  <th className="py-1.5 text-left font-medium">Đang mua</th>
                  <th className="py-1.5 text-right font-medium">DS 12 tháng</th>
                  <th className="py-1.5 pl-3 text-left font-medium">Tiến trình</th>
                  <th className="py-1.5 text-left font-medium">Vấn đề</th>
                  <th className="py-1.5 text-left font-medium">Tình trạng</th>
                  <th className="py-1.5 text-right font-medium">Hồ sơ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.slice(0, limit).map((r) => (
                  <ReportRow key={r.id} r={r} team={data.scope === "TEAM"} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="py-3 text-sm text-muted-foreground">Không có khách phù hợp.</p>}
            {filtered.length > limit && (
              <button onClick={() => setLimit(limit + PAGE)} className="mt-2 text-xs text-amber-400 hover:underline">
                Xem thêm ({filtered.length - limit} khách)
              </button>
            )}
          </div>

          {isAdmin && data.report.unclassifiedItems.length > 0 && <UnclassifiedItems items={data.report.unclassifiedItems} canFix={canFixGroups} />}
        </>
      )}
    </div>
  );
}

function ReportRow({ r, team, open, onToggle }: { r: CustomerReportRow; team: boolean; open: boolean; onToggle: () => void }) {
  const stageChanged = r.stagePrev && r.stagePrev !== r.stageEffective;
  return (
    <>
      <tr className={cn("cursor-pointer align-top hover:bg-white/[0.03]", open && "bg-white/[0.04]")} onClick={onToggle}>
        <td className="max-w-[260px] py-2 pr-2">
          <span className="font-mono font-semibold text-amber-400">{r.customerCode}</span>
          <p className="truncate text-ink" title={r.customerName}>
            {r.customerName}
          </p>
          {r.province && <p className="text-[11px] text-muted-foreground">{r.province}</p>}
        </td>
        {team && <td className="py-2 pr-2 text-ink2">{r.employeeName}</td>}
        <td className="py-2 pr-2">{r.tier ? (r.tier === "NGU" ? "Ngủ" : r.tier) : "—"}</td>
        <td className="py-2 pr-2 text-ink2">
          {r.industry ? INDUSTRIES[r.industry as keyof typeof INDUSTRIES] : <span className="text-muted-foreground">—</span>}
          {r.staffSize && <p className="text-[11px] text-muted-foreground">{STAFF_SIZES[r.staffSize as keyof typeof STAFF_SIZES]}{r.ownership ? ` · ${r.ownership}` : ""}</p>}
        </td>
        <td className="max-w-[220px] py-2 pr-2 text-ink2">{r.groupsText || <span className="text-muted-foreground">—</span>}</td>
        <td className="py-2 text-right font-mono">{money(r.value12)}</td>
        <td className="py-2 pl-3 pr-2">
          {r.stage ? <span className="text-ink">{STAGES[r.stage]}</span> : <span className="text-sky-300" title="App gợi ý, NVKD chưa xác nhận">{STAGES[r.stageSuggested]} (gợi ý)</span>}
          {stageChanged && <p className="text-[11px] text-muted-foreground">tháng trước: {STAGES[r.stagePrev as StageKey]}</p>}
        </td>
        <td className="max-w-[200px] py-2 pr-2 text-ink2">
          {r.issue && <p className="text-alert">{r.issue.note ?? r.issue.type}</p>}
          {r.painPoint && <p className="truncate" title={r.painPoint}>{r.painPoint}</p>}
          {!r.issue && !r.painPoint && <span className="text-muted-foreground">—</span>}
        </td>
        <td className={cn("py-2 pr-2", STATUS_TONE[r.status])}>
          {STATUSES[r.status]}
          {r.lastTouchAt && <p className="text-[11px] text-muted-foreground">chạm {formatDateVN(r.lastTouchAt)}</p>}
          {r.overdueDebt > 0 && <p className="text-[11px] text-alert">nợ quá hạn {money(r.overdueDebt)}</p>}
        </td>
        <td className={cn("py-2 text-right font-mono font-semibold", pctTone(r.completeness))} title={r.missing.length ? `Còn thiếu: ${r.missing.join(", ")}` : "Đầy đủ"}>
          {r.completeness}%
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={team ? 10 : 9} className="pb-3">
            <ProfileForm row={r} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Nhập lại file Excel: chọn file -> xem trước thay đổi -> xác nhận ghi. */
function ImportButton() {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rowsRead: number; changes: ImportChange[]; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(f: File, mode: "preview" | "commit") {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("mode", mode);
      const res = await fetch("/api/customer-report/import", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không nhập được file");
      if (mode === "commit") {
        setMsg(`Đã cập nhật ${json.customersUpdated} khách (${json.changes.length} thay đổi).`);
        setPreview(null);
        setFile(null);
        qc.invalidateQueries({ queryKey: ["customer-report"] });
      } else setPreview(json);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không nhập được file");
    } finally {
      setBusy(false);
    }
  }

  const fmt = (field: string, v: string | number | null) => {
    if (v == null || v === "") return "(trống)";
    if (field === "potentialYear") return `${Math.round(Number(v) / 1e6).toLocaleString("vi-VN")} tr`;
    if (field === "industry") return INDUSTRIES[v as keyof typeof INDUSTRIES] ?? String(v);
    if (field === "stage") return STAGES[v as StageKey] ?? String(v);
    if (field === "staffSize") return STAFF_SIZES[v as keyof typeof STAFF_SIZES] ?? String(v);
    return String(v);
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            setFile(f);
            send(f, "preview");
          }
        }}
      />
      <button disabled={busy} onClick={() => ref.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 px-3 py-1.5 text-xs font-semibold text-amber-400 disabled:opacity-40">
        <Upload className="h-3.5 w-3.5" /> {busy ? "Đang đọc..." : "Nhập lại từ Excel"}
      </button>
      {msg && !preview && (
        <span className="self-center text-xs text-emerald-300">
          {msg}
          <button onClick={() => setMsg(null)} className="ml-1 text-muted-foreground" aria-label="Đóng">
            <X className="inline h-3 w-3" />
          </button>
        </span>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-200/30 bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-ink">Xem trước khi cập nhật</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Đọc {preview.rowsRead} dòng · {preview.changes.length} thay đổi trên {new Set(preview.changes.map((c) => c.customerId)).size} khách. Ô để trống không xoá dữ liệu đang có.
            </p>
            {preview.errors.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-amber-500/30 p-2 text-xs text-amber-400">
                {preview.errors.slice(0, 50).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                {preview.errors.length > 50 && <p>... và {preview.errors.length - 50} dòng khác</p>}
              </div>
            )}
            {preview.changes.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Không có gì thay đổi so với dữ liệu trên app.</p>
            ) : (
              <table className="mt-3 min-w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left font-medium">Khách</th>
                    <th className="py-1 text-left font-medium">Mục</th>
                    <th className="py-1 text-left font-medium">Đang có</th>
                    <th className="py-1 text-left font-medium">Đổi thành</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {preview.changes.slice(0, 300).map((c, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2 font-mono text-amber-400" title={c.customerName}>
                        {c.customerCode}
                      </td>
                      <td className="py-1 pr-2 text-ink2">{FIELD_LABEL[c.field] ?? c.field}</td>
                      <td className="max-w-[260px] truncate py-1 pr-2 text-muted-foreground">{fmt(c.field, c.from)}</td>
                      <td className="max-w-[260px] truncate py-1 text-emerald-300">{fmt(c.field, c.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="rounded-lg border border-gray-200/40 px-4 py-2 text-sm text-ink2">
                Huỷ
              </button>
              <button disabled={busy || !file || preview.changes.length === 0} onClick={() => file && send(file, "commit")} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
                {busy ? "Đang ghi..." : `Cập nhật ${preview.changes.length} thay đổi`}
              </button>
            </div>
            {msg && <p className="mt-2 text-sm text-alert">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}

/** Mã hàng app chưa tự xếp nhóm sản phẩm — anh chọn nhóm 1 lần. */
function UnclassifiedItems({ items, canFix }: { items: CustomerReport["unclassifiedItems"]; canFix: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Record<string, GroupKey>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + i.value12, 0);
  async function save() {
    const list = Object.entries(pick).map(([itemCode, groupKey]) => ({ itemCode, groupKey }));
    const res = await fetch("/api/customer-report/item-groups", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: list }) });
    const json = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Đã xếp nhóm ${json.saved} mã hàng.` : json.error ?? "Không lưu được");
    if (res.ok) {
      setPick({});
      qc.invalidateQueries({ queryKey: ["customer-report"] });
    }
  }
  return (
    <div className={card}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-sm font-semibold text-ink">
        <span>
          Mã hàng chưa xếp nhóm sản phẩm ({items.length}) <span className="font-normal text-muted-foreground">· {money(total)} doanh số đang vào nhóm “Khác”</span>
        </span>
        <span className="text-xs text-amber-400">{open ? "Thu gọn" : "Mở"}</span>
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto">
          {msg && <p className="mb-2 text-sm text-emerald-300">{msg}</p>}
          <table className="min-w-full text-xs">
            <tbody className="divide-y divide-white/5">
              {items.map((i) => (
                <tr key={i.itemCode ?? i.itemName}>
                  <td className="py-1 pr-2 font-mono text-amber-400">{i.itemCode ?? "—"}</td>
                  <td className="py-1 pr-2 text-ink2">{i.itemName}</td>
                  <td className="py-1 pr-2 text-right font-mono">{money(i.value12)}</td>
                  <td className="py-1">
                    {canFix && i.itemCode && (
                      <select value={pick[i.itemCode] ?? ""} onChange={(e) => setPick({ ...pick, [i.itemCode!]: e.target.value as GroupKey })} className={sel}>
                        <option value="">Chọn nhóm...</option>
                        {GROUP_KEYS.map((g) => (
                          <option key={g} value={g}>
                            {PRODUCT_GROUPS[g]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canFix && Object.keys(pick).length > 0 && (
            <button onClick={save} className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black">
              Lưu nhóm cho {Object.keys(pick).length} mã hàng
            </button>
          )}
        </div>
      )}
    </div>
  );
}
