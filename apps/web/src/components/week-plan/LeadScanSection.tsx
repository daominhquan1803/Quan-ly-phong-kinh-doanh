"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, UploadCloud } from "lucide-react";
import type { Granularity, LeadGroupReport, LeadReport } from "@/lib/lead-scan";
import type { IncompleteRow, LeadImportSummary, LeadWeekRow } from "@/lib/lead-scan-data";
import { cn } from "@/lib/utils";

const card = "glass-card border border-white/10 p-5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]";
const th = "text-xs font-semibold text-muted2 text-right px-2 py-1.5 whitespace-nowrap";
const td = "text-sm text-ink text-right px-2 py-1.5 font-mono tabular-nums";

const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDT = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN") : "chưa nhập lần nào");
const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

// ---------------------------------------------------------------- Lead MXH trong tuần đang xem

interface WeekResponse {
  rows: LeadWeekRow[];
  scanned: number;
  unassigned: number;
  from: string;
  to: string;
  isAdmin: boolean;
}

export function LeadMxhWeek({ weekStartISO, isAdmin }: { weekStartISO: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["lead-week", weekStartISO],
    queryFn: async () => {
      const res = await fetch(`/api/lead-scan/week?weekStart=${encodeURIComponent(weekStartISO)}`);
      if (!res.ok) throw new Error("Không tải được Lead MXH");
      return res.json() as Promise<WeekResponse>;
    },
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setDraft({});
    setMsg(null);
  }, [weekStartISO]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setMsg(null);
    const targets = data.rows.map((r) => ({ employeeId: r.employeeId, targetValue: Math.max(0, Math.floor(Number(draft[r.employeeId] ?? r.target) || 0)) }));
    const res = await fetch("/api/lead-scan/week", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart: weekStartISO, targets }) });
    setSaving(false);
    if (res.ok) {
      setDraft({});
      setMsg("Đã lưu chỉ tiêu Lead MXH");
      qc.invalidateQueries({ queryKey: ["lead-week"] });
    } else setMsg((await res.json().catch(() => ({}))).error ?? "Lưu thất bại");
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-semibold text-ink text-sm tracking-wide">Lead MXH (quét Facebook) — chỉ tiêu riêng</h2>
        {data && (
          <span className="text-xs text-muted2">
            Tuần quét được <span className="font-mono text-ink">{data.scanned}</span> bài · chưa giao <span className="font-mono text-amber-400">{data.unassigned}</span>
          </span>
        )}
      </div>
      <p className="text-xs text-muted2 mb-3">
        Không nằm trong 6 mục và trọng số 100 của điểm tuần. Chỉ <b>liên hệ ghi nhận</b> mới tính vào chỉ tiêu: dòng trên sheet phải đủ Ngày liên hệ, NVKD nhận và Kết quả — dòng thiếu nằm ở cột “Chưa đủ thông tin”. “Liên hệ được” là khách đã
        phản hồi/trao đổi (đã nhắn, để lại thông tin chờ khách chưa tính).
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : !data || data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có dữ liệu — Quản trị hệ thống nhập file sheet ở mục “Báo cáo quét lead” bên dưới.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className={cn(th, "text-left")}>Nhân viên</th>
                <th className={th}>Chỉ tiêu</th>
                <th className={th}>Khách nhận</th>
                <th className={th}>Liên hệ ghi nhận</th>
                <th className={th}>Liên hệ được</th>
                <th className={th}>Chưa đủ thông tin</th>
                <th className={cn(th, "min-w-[120px]")}>Hoàn thành</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const target = Number(draft[r.employeeId] ?? r.target) || 0;
                const p = target > 0 ? Math.round((r.contacted / target) * 100) : null;
                return (
                  <tr key={r.employeeId} className="border-b border-white/5">
                    <td className="text-sm text-ink px-2 py-1.5">{r.name}</td>
                    <td className={td}>
                      {isAdmin ? (
                        <input
                          type="number"
                          min={0}
                          value={draft[r.employeeId] ?? String(r.target)}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.employeeId]: e.target.value }))}
                          className="w-16 text-right text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-1.5"
                        />
                      ) : (
                        r.target
                      )}
                    </td>
                    <td className={td}>{r.assigned}</td>
                    <td className={cn(td, "font-semibold")}>{r.contacted}</td>
                    <td className={td}>{r.reached}</td>
                    <td className={cn(td, r.incomplete > 0 && "text-amber-400")}>{r.incomplete}</td>
                    <td className="px-2 py-1.5">
                      {p == null ? (
                        <span className="text-xs text-muted2">chưa đặt chỉ tiêu</span>
                      ) : (
                        <div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className={cn("h-full rounded-full", p >= 100 ? "bg-success-600" : "bg-alert")} style={{ width: `${Math.min(p, 100)}%` }} />
                          </div>
                          <p className="text-[11px] text-muted2 text-right font-mono">{p}%</p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {isAdmin && data && data.rows.length > 0 && (
        <div className="flex items-center gap-3 mt-3">
          <button onClick={save} disabled={saving || Object.keys(draft).length === 0} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50">
            {saving ? "Đang lưu..." : "Lưu chỉ tiêu Lead MXH"}
          </button>
          {msg && <span className="text-xs text-muted2">{msg}</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Báo cáo quét lead (toàn bộ sheet)

type Preset = "month" | "lastMonth" | "d30" | "all";
const PRESET_LABEL: Record<Preset, string> = { month: "Tháng này", lastMonth: "Tháng trước", d30: "30 ngày gần nhất", all: "Tất cả" };
const GRAN_LABEL: Record<Granularity, string> = { day: "Theo ngày", week: "Theo tuần", month: "Theo tháng" };

function rangeOf(p: Preset): { from: string; to: string } {
  const now = new Date();
  const today = localISO(now);
  if (p === "month") return { from: localISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (p === "lastMonth") return { from: localISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: localISO(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (p === "d30") return { from: localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), to: today };
  return { from: "2026-01-01", to: today };
}

interface ReportResponse {
  report: LeadReport;
  incomplete: IncompleteRow[];
  lastImportAt: string | null;
}

function Stat({ label, value, sub, warn }: { label: string; value: number | string; sub?: string; warn?: boolean }) {
  return (
    <div className="glass-card border border-white/5 bg-white/[0.02] px-3.5 py-3 rounded-xl">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-mono tabular-nums font-semibold", warn ? "text-amber-400" : "text-ink")}>{value}</p>
      {sub && <p className="text-[11px] text-muted2">{sub}</p>}
    </div>
  );
}

function SeriesTable({ g, gran, totalLabel }: { g: LeadGroupReport; gran: Granularity; totalLabel: string }) {
  const rows = [...g.series[gran]].reverse();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Chưa có số liệu trong khoảng này.</p>;
  return (
    <div className="overflow-x-auto max-h-80 overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-white/10">
            <th className={cn(th, "text-left")}>{GRAN_LABEL[gran].replace("Theo ", "")}</th>
            <th className={th}>{totalLabel}</th>
            <th className={th}>Khách nhận</th>
            <th className={th}>Liên hệ ghi nhận</th>
            <th className={th}>Liên hệ được</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-white/5">
              <td className="text-sm text-ink px-2 py-1.5">{r.label}</td>
              <td className={td}>{r.total}</td>
              <td className={td}>{r.assigned}</td>
              <td className={td}>{r.contacted}</td>
              <td className={td}>{r.reached}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeTable({ g }: { g: LeadGroupReport }) {
  if (g.byEmployee.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            <th className={cn(th, "text-left")}>Nhân viên</th>
            <th className={th}>Khách nhận</th>
            <th className={th}>Liên hệ ghi nhận</th>
            <th className={th}>Liên hệ được</th>
            <th className={th}>Chưa đủ thông tin</th>
          </tr>
        </thead>
        <tbody>
          {g.byEmployee.map((e) => (
            <tr key={e.employeeId ?? e.name} className="border-b border-white/5">
              <td className="text-sm text-ink px-2 py-1.5">{e.name}</td>
              <td className={td}>{e.assigned}</td>
              <td className={td}>{e.contacted}</td>
              <td className={td}>{e.reached}</td>
              <td className={cn(td, e.incomplete > 0 && "text-amber-400")}>{e.incomplete}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const KIND_LABEL: Record<IncompleteRow["kind"], string> = { FB: "Facebook", SCAN: "Khách quét báo", SELF: "Tự tìm" };

export function LeadScanReport({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("month");
  const [gran, setGran] = useState<Granularity>("day");
  const { from, to } = rangeOf(preset);
  const { data, isLoading, error } = useQuery({
    queryKey: ["lead-report", from, to],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/lead-scan/report?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Không tải được báo cáo quét lead");
      return res.json() as Promise<ReportResponse>;
    },
  });

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imp, setImp] = useState<{ ok: boolean; text: string; summary?: LeadImportSummary } | null>(null);
  async function upload() {
    if (!file) return;
    setUploading(true);
    setImp(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/lead-scan/import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (res.ok) {
      setImp({ ok: true, text: "Đã nhập xong", summary: json });
      qc.invalidateQueries({ queryKey: ["lead-report"] });
      qc.invalidateQueries({ queryKey: ["lead-week"] });
    } else setImp({ ok: false, text: json.error ?? "Nhập file thất bại" });
  }

  const r = data?.report;
  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 w-full text-left">
        {open ? <ChevronDown className="h-4 w-4 text-amber-400" /> : <ChevronRight className="h-4 w-4 text-amber-400" />}
        <h2 className="font-semibold text-ink text-sm tracking-wide">Báo cáo quét lead (Google Sheet “Theo dõi khách tiềm năng”)</h2>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {isAdmin && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Cập nhật số liệu: trên Google Sheet chọn <b>Tệp → Tải xuống → Microsoft Excel (.xlsx)</b> rồi tải lên đây. Nhập lại nhiều lần thoải mái — dòng cũ được cập nhật, không bị trùng. Dữ liệu hiện tại:{" "}
                <span className="text-ink">{fmtDT(data?.lastImportAt ?? null)}</span>.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs text-muted-foreground" />
                <button onClick={upload} disabled={!file || uploading} className="flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50">
                  <UploadCloud className="h-3.5 w-3.5" />
                  {uploading ? "Đang nhập..." : "Nhập file sheet"}
                </button>
              </div>
              {imp && (
                <div className={cn("text-xs", imp.ok ? "text-ink" : "text-alert")}>
                  <p>{imp.text}</p>
                  {imp.summary && (
                    <ul className="mt-1 space-y-0.5 text-muted2">
                      <li>
                        Facebook: {imp.summary.fb.total} bài ({Object.entries(imp.summary.fb.byStatus).map(([k, v]) => `${k} ${v}`).join(", ")})
                      </li>
                      <li>
                        Khách tiềm năng: {imp.summary.prospects.total} ({Object.entries(imp.summary.prospects.byStatus).map(([k, v]) => `${k} ${v}`).join(", ")}) · nhật ký quét: {imp.summary.logs} lượt
                      </li>
                      {imp.summary.unmatchedNames.length > 0 && <li className="text-amber-400">Tên NVKD chưa khớp nhân viên nào: {imp.summary.unmatchedNames.join(", ")} — sửa tên trong sheet hoặc thêm bí danh.</li>}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
              <button key={p} onClick={() => setPreset(p)} className={cn("text-xs px-3 py-1.5 rounded-xl border", preset === p ? "border-amber-500/50 bg-amber-500/15 text-amber-300 font-semibold" : "border-white/10 text-muted-foreground hover:text-ink")}>
                {PRESET_LABEL[p]}
              </button>
            ))}
            <span className="mx-1 text-white/20">|</span>
            {(Object.keys(GRAN_LABEL) as Granularity[]).map((g) => (
              <button key={g} onClick={() => setGran(g)} className={cn("text-xs px-3 py-1.5 rounded-xl border", gran === g ? "border-amber-500/50 bg-amber-500/15 text-amber-300 font-semibold" : "border-white/10 text-muted-foreground hover:text-ink")}>
                {GRAN_LABEL[g]}
              </button>
            ))}
            <span className="text-xs text-muted2 ml-auto">
              {dmy(from)} – {dmy(to)}
            </span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : error || !r ? (
            <p className="text-sm text-alert">Không tải được báo cáo.</p>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">Facebook — bài hỏi hàng quét được</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Stat label="Bài quét" value={r.fb.total} sub={`${r.scanRuns.ok} lượt quét OK · ${r.scanRuns.postsRead} bài đọc`} />
                  <Stat label="Khách nhận (đã giao NVKD)" value={r.fb.assigned} sub={`${r.fb.total ? Math.round((r.fb.assigned / r.fb.total) * 100) : 0}% bài quét`} />
                  <Stat label="Chưa giao" value={r.fb.unassigned} warn={r.fb.unassigned > 0} />
                  <Stat label="Liên hệ ghi nhận" value={r.fb.contacted} sub="đủ thông tin" />
                  <Stat label="Liên hệ được" value={r.fb.reached} sub={`${r.fb.contacted ? Math.round((r.fb.reached / r.fb.contacted) * 100) : 0}% số liên hệ`} />
                  <Stat label="Chưa đủ thông tin" value={r.fb.incomplete} warn={r.fb.incomplete > 0} sub="chưa được tính" />
                </div>
                <SeriesTable g={r.fb} gran={gran} totalLabel="Bài quét" />
                <EmployeeTable g={r.fb} />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">Khách doanh nghiệp lớn quét từ báo</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <Stat label="Khách tìm được" value={r.scan.total} />
                  <Stat label="Đã giao NVKD" value={r.scan.assigned} />
                  <Stat label="Liên hệ ghi nhận" value={r.scan.contacted} sub="đủ thông tin" />
                  <Stat label="Liên hệ được" value={r.scan.reached} />
                  <Stat label="Chưa đủ thông tin" value={r.scan.incomplete} warn={r.scan.incomplete > 0} />
                </div>
                <EmployeeTable g={r.scan} />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">Khách NVKD tự tìm</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <Stat label="Khách tìm được" value={r.self.total} />
                  <Stat label="Đã ghi kết quả" value={r.self.contacted + r.self.incomplete} />
                  <Stat label="Liên hệ ghi nhận" value={r.self.contacted} sub="đủ thông tin" />
                  <Stat label="Liên hệ được" value={r.self.reached} />
                  <Stat label="Chưa đủ thông tin" value={r.self.incomplete} warn={r.self.incomplete > 0} />
                </div>
                <SeriesTable g={r.self} gran={gran} totalLabel="Khách tìm" />
                <EmployeeTable g={r.self} />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">Nhật ký quét</h3>
                <p className="text-xs text-muted2">
                  {r.scanRuns.runs} lượt ({r.scanRuns.ok} thành công, <span className={r.scanRuns.failed ? "text-amber-400" : ""}>{r.scanRuns.failed} hỏng</span>) · {r.scanRuns.groups} lượt-nhóm · đọc {r.scanRuns.postsRead} bài · {r.scanRuns.newPosts} bài mới.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">Dòng chưa đủ thông tin — chưa được ghi nhận ({data?.incomplete.length ?? 0})</h3>
                <p className="text-xs text-muted2">Bổ sung đúng mục còn thiếu trên Google Sheet, lần cập nhật sau dòng sẽ được tính.</p>
                {(data?.incomplete.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">Không có.</p>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-white/10">
                          <th className={cn(th, "text-left")}>Nguồn</th>
                          <th className={cn(th, "text-left")}>Khách / bài</th>
                          <th className={cn(th, "text-left")}>NVKD</th>
                          <th className={th}>Ngày</th>
                          <th className={cn(th, "text-left")}>Còn thiếu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data!.incomplete.map((i, idx) => (
                          <tr key={idx} className="border-b border-white/5">
                            <td className="text-xs text-muted-foreground px-2 py-1.5">{KIND_LABEL[i.kind]}</td>
                            <td className="text-sm text-ink px-2 py-1.5 max-w-[280px] truncate" title={i.title}>
                              {i.link ? (
                                <a href={i.link} target="_blank" rel="noreferrer" className="underline decoration-dotted">
                                  {i.title}
                                </a>
                              ) : (
                                i.title
                              )}
                            </td>
                            <td className="text-sm text-ink px-2 py-1.5">{i.employee}</td>
                            <td className={td}>{dmy(i.date)}</td>
                            <td className="text-xs text-amber-400 px-2 py-1.5">{i.missing}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
