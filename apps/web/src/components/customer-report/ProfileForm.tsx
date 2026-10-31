"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import { INDUSTRIES, OWNERSHIPS, STAFF_SIZES, STAGES, STATUSES, type StageKey } from "@/lib/customer-profile";
import type { CustomerReportRow } from "@/lib/customer-report";

function Chip({ active, onClick, children, hint }: { active: boolean; onClick: () => void; children: React.ReactNode; hint?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-amber-400 bg-amber-500/15 font-semibold text-amber-400" : hint ? "border-dashed border-sky-400/60 text-sky-300" : "border-gray-200/40 text-ink2 hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}
const L = ({ children }: { children: React.ReactNode }) => <p className="mb-1 mt-3 text-xs font-medium text-muted-foreground">{children}</p>;
const input = "w-full rounded-lg border border-gray-200/40 bg-transparent px-3 py-1.5 text-sm text-ink";

/** Khung "Hồ sơ khách": tải dữ liệu 1 khách rồi cho sửa. Dùng ở trang Chăm sóc và trang Báo cáo. */
export function ProfileBox({ customerId, onSaved, onDirtyChange }: { customerId: string; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-profile", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/profile`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được hồ sơ");
      return json.row as CustomerReportRow | null;
    },
  });
  if (isLoading) return <div className="rounded-2xl border border-gray-200/30 p-4 text-sm text-muted-foreground">Đang tải hồ sơ khách...</div>;
  if (error) return <div className="rounded-2xl border border-gray-200/30 p-4 text-sm text-alert">{(error as Error).message}</div>;
  if (!data) return null;
  return <ProfileForm key={`${data.id}-${data.completeness}-${data.stage}`} row={data} onSaved={onSaved} onDirtyChange={onDirtyChange} />;
}

const fmtSavedAt = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function ProfileForm({ row, onSaved, onDirtyChange }: { row: CustomerReportRow; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    address: row.addressAuto ? "" : row.address ?? "",
    province: row.province ?? "",
    industry: row.industry ?? "",
    staffSize: row.staffSize ?? "",
    ownership: row.ownership ?? "",
    contactPerson: row.contactPerson ?? "",
    contactPhone: row.contactPhone ?? "",
    competitors: row.competitors ?? "",
    potentialM: row.potentialYear != null ? String(Math.round(row.potentialYear / 1e6)) : "",
    stage: row.stage ?? "",
    painPoint: row.painPoint ?? "",
  });
  // Giá trị đã lưu (hoặc lúc mở) — khác `f` nghĩa là có thay đổi CHƯA LƯU (form này có nút lưu riêng, tách khỏi "Ghi chăm sóc").
  const [base, setBase] = useState(f);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const toggle = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: cur[k] === v ? "" : v }));

  const save = useMutation({
    mutationFn: async (override?: Partial<typeof f>) => {
      const v = { ...f, ...override };
      const body = {
        address: v.address.trim() || (row.addressAuto ? undefined : null),
        province: v.province.trim() || null,
        industry: v.industry || null,
        staffSize: v.staffSize || null,
        ownership: v.ownership || null,
        contactPerson: v.contactPerson.trim() || null,
        contactPhone: v.contactPhone.trim() || null,
        competitors: v.competitors.trim() || null,
        potentialYear: v.potentialM.trim() ? Math.round(Number(v.potentialM.replace(/[^\d.]/g, "")) * 1e6) : null,
        stage: v.stage || null,
        painPoint: v.painPoint.trim() || null,
      };
      const res = await fetch(`/api/customers/${row.id}/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không lưu được");
      return v;
    },
    onSuccess: (v) => {
      setBase(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ["customer-profile", row.id] });
      qc.invalidateQueries({ queryKey: ["customer-report"] });
      onSaved?.();
    },
  });

  return (
    <div className="rounded-2xl border border-gray-200/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ClipboardList className="h-4 w-4 text-amber-400" /> Hồ sơ khách
        </p>
        <span className={cn("text-xs font-semibold", row.completeness >= 90 ? "text-emerald-300" : row.completeness >= 70 ? "text-amber-400" : "text-alert")}>
          Đầy đủ {row.completeness}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full", row.completeness >= 90 ? "bg-emerald-400" : row.completeness >= 70 ? "bg-amber-400" : "bg-red-500")} style={{ width: `${row.completeness}%` }} />
      </div>
      {row.missing.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Còn thiếu: {row.missing.join(", ")}</p>}
      <p className="mt-1 text-[11px] text-muted-foreground">{row.profileUpdatedAt ? `Lưu lần cuối: ${fmtSavedAt(row.profileUpdatedAt)}` : "Chưa lưu hồ sơ lần nào"}</p>
      {dirty && (
        <p className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400">
          Có thay đổi chưa lưu — bấm “Lưu hồ sơ khách” ở cuối khung này. Chuyển khách hoặc đóng trang sẽ mất phần vừa nhập.
        </p>
      )}

      <div className="mt-3 rounded-lg bg-white/[0.03] p-2.5 text-xs text-ink2">
        <p>
          <span className="text-muted-foreground">Đang mua:</span> {row.groupsText || "chưa có đơn 12 tháng"}
        </p>
        <p className="mt-0.5">
          <span className="text-muted-foreground">Tình trạng:</span> {STATUSES[row.status]}
          {row.lastOrderAt && <span className="text-muted-foreground"> · đơn cuối {formatDateVN(row.lastOrderAt)}</span>}
          {row.issue && <span className="text-alert"> · vấn đề: {row.issue.note ?? row.issue.type}</span>}
        </p>
      </div>

      <L>Tiến trình mua hàng {!row.stage && <span className="text-sky-300">— app gợi ý: {STAGES[row.stageSuggested]}</span>}</L>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(STAGES) as StageKey[]).map((k) => (
          <Chip key={k} active={f.stage === k} hint={!f.stage && row.stageSuggested === k} onClick={() => toggle("stage", k)}>
            {STAGES[k]}
          </Chip>
        ))}
      </div>
      {!row.stage && (
        <button
          disabled={save.isPending}
          onClick={() => {
            set("stage", row.stageSuggested);
            save.mutate({ stage: row.stageSuggested });
          }}
          className="mt-1.5 text-xs text-sky-300 hover:underline"
        >
          Xác nhận gợi ý “{STAGES[row.stageSuggested]}”
        </button>
      )}

      <L>Ngành nghề</L>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(INDUSTRIES).map(([k, v]) => (
          <Chip key={k} active={f.industry === k} onClick={() => toggle("industry", k)}>
            {v}
          </Chip>
        ))}
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div>
          <L>Quy mô nhân sự</L>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(STAFF_SIZES).map(([k, v]) => (
              <Chip key={k} active={f.staffSize === k} onClick={() => toggle("staffSize", k)}>
                {v}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <L>Loại hình</L>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(OWNERSHIPS).map(([k, v]) => (
              <Chip key={k} active={f.ownership === k} onClick={() => toggle("ownership", k)}>
                {v}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <L>Địa chỉ {row.addressAuto && <span className="text-muted-foreground">(đang lấy từ AMIS — gõ để sửa)</span>}</L>
          <input className={input} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder={row.addressAuto ? row.address ?? "" : "Địa chỉ nhà máy / văn phòng"} />
        </div>
        <div>
          <L>Tỉnh / TP</L>
          <input className={input} value={f.province} onChange={(e) => set("province", e.target.value)} placeholder={row.province ?? "vd Bắc Ninh"} />
        </div>
        <div>
          <L>Tiềm năng mua bao bì / năm (triệu đồng)</L>
          <input className={input} inputMode="numeric" value={f.potentialM} onChange={(e) => set("potentialM", e.target.value)} placeholder="vd 500" />
        </div>
        <div>
          <L>Người liên hệ</L>
          <input className={input} value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} placeholder="Tên, chức vụ" />
        </div>
        <div>
          <L>SĐT</L>
          <input className={input} inputMode="tel" value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <L>Đối thủ đang cung cấp</L>
          <input className={input} value={f.competitors} onChange={(e) => set("competitors", e.target.value)} placeholder="Tên NCC khác khách đang mua" />
        </div>
        <div className="sm:col-span-2">
          <L>Vấn đề / khó khăn</L>
          <textarea className={cn(input, "min-h-[56px]")} value={f.painPoint} onChange={(e) => set("painPoint", e.target.value)} placeholder="Khó khăn khi bán cho khách này (giá, chất lượng, quyết định ở công ty mẹ...)" />
        </div>
      </div>

      {save.isError && <p className="mt-2 text-sm text-alert">{(save.error as Error).message}</p>}
      {saved && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Đã lưu hồ sơ
        </p>
      )}
      <button disabled={save.isPending} onClick={() => save.mutate(undefined)} className="mt-3 w-full rounded-lg border border-amber-500/50 py-2 text-sm font-semibold text-amber-400 disabled:opacity-40">
        {save.isPending ? "Đang lưu..." : "Lưu hồ sơ khách"}
      </button>
    </div>
  );
}
