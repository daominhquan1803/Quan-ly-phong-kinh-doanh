"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatDateVN, toDateInputValueVN } from "@/lib/utils";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { buildGoogleMapsMultiStopUrl } from "@/lib/business-trip-maps";
import { Check, X, Trash2, Plus, MapPin, ArrowUp, ArrowDown, Pencil } from "lucide-react";

interface StopRow {
  id: string;
  orderIndex: number;
  companyName: string;
  address: string | null;
  expectedTime: string | null;
  content: string;
}
interface TripRow {
  id: string;
  employee: { id: string; name: string };
  visitDate: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: { id: string; name: string } | null;
  rejectReason: string | null;
  supporters: { employee: { id: string; name: string } }[];
  stops: StopRow[];
  // Quá hạn đăng ký của tuần chứa ngày đi — NVKD không sửa/huỷ được nữa, chỉ Quản trị viên.
  entryLocked?: boolean;
}

const STATUS_LABEL: Record<TripRow["status"], string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
};
const STATUS_STYLE: Record<TripRow["status"], string> = {
  PENDING: "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_8px_rgba(224,163,39,0.2)]",
  APPROVED: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]",
  REJECTED: "bg-brandRed-500/15 text-brandRed-400 border border-brandRed-500/30 shadow-[0_0_8px_rgba(200,16,46,0.2)]",
};

export function BusinessTripsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: session } = useSession();
  const [employeeId, setEmployeeId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripRow | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["business-trips", employeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set("employeeId", employeeId);
      const res = await fetch(`/api/business-trips?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách đăng ký");
      return res.json() as Promise<{ trips: TripRow[] }>;
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["business-trips"] });
  }

  async function handleAction(id: string, action: "approve" | "reject" | "cancel") {
    let rejectReason: string | undefined;
    if (action === "reject") {
      rejectReason = window.prompt("Lý do từ chối (không bắt buộc):") || undefined;
    } else if (action === "cancel") {
      if (!window.confirm("Huỷ đăng ký này?")) return;
    }
    const res = await fetch(`/api/business-trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectReason }),
    });
    if (res.ok) invalidate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {isAdmin ? (
          <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />
        ) : (
          <span />
        )}
        <button
          onClick={() => {
            setEditingTrip(null);
            setShowForm((v) => !v);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 hover:from-brandRed-500 hover:to-brandRed-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(200,16,46,0.3)] transition-all"
        >
          {showForm ? "Đóng" : "+ Đăng ký đi công tác"}
        </button>
      </div>

      {showForm && (
        <TripForm isAdmin={isAdmin} currentUserId={session?.user?.id} onCreated={() => { setShowForm(false); invalidate(); }} />
      )}
      {editingTrip && (
        <TripForm
          isAdmin={isAdmin}
          currentUserId={session?.user?.id}
          editingTrip={editingTrip}
          onCreated={() => { setEditingTrip(null); invalidate(); }}
          onCancelEdit={() => setEditingTrip(null)}
        />
      )}

      <div className="glass-card border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <table className="min-w-full text-xs">
          <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5 backdrop-blur-md">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Ngày đi</th>
              {isAdmin && <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>}
              <th className="text-left font-medium px-4 py-2.5">Khách hàng ghé (buổi này)</th>
              <th className="text-left font-medium px-4 py-2.5">Người đi hỗ trợ</th>
              <th className="text-left font-medium px-4 py-2.5">Trạng thái</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && (data?.trips.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Chưa có đăng ký nào.
                </td>
              </tr>
            )}
            {data?.trips.map((t) => {
              const mapsUrl = buildGoogleMapsMultiStopUrl(t.stops.map((s) => s.address));
              return (
                <tr key={t.id} className="hover:bg-white/[0.02] align-top transition-colors">
                  <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">{formatDateVN(t.visitDate)}</td>
                  {isAdmin && <td className="px-4 py-2.5 whitespace-nowrap">{t.employee.name}</td>}
                  <td className="px-4 py-2.5">
                    <ol className="space-y-1.5">
                      {t.stops.map((s, i) => (
                        <li key={s.id}>
                          <p className="font-medium text-ink">
                            {i + 1}. {s.companyName}
                            {s.expectedTime && <span className="text-muted-foreground font-normal"> — {s.expectedTime}</span>}
                          </p>
                          {s.address && <p className="text-xs text-muted-foreground">{s.address}</p>}
                          <p className="text-xs text-ink2" title={s.content}>
                            {s.content}
                          </p>
                        </li>
                      ))}
                    </ol>
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        <MapPin className="h-3.5 w-3.5" /> Mở lộ trình trên Google Maps
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {t.supporters.length > 0 ? t.supporters.map((s) => s.employee.name).join(", ") : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("status-badge", STATUS_STYLE[t.status])}>{STATUS_LABEL[t.status]}</span>
                    {t.status === "REJECTED" && t.rejectReason && (
                      <p className="text-[11px] text-muted2 mt-0.5">{t.rejectReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {t.status === "PENDING" && isAdmin && (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleAction(t.id, "approve")}
                          className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-colors"
                          title="Duyệt"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleAction(t.id, "reject")}
                          className="p-1.5 rounded-lg bg-brandRed-500/15 text-brandRed-400 hover:bg-brandRed-500/25 border border-brandRed-500/30 transition-colors"
                          title="Từ chối"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                    {t.status === "PENDING" && t.employee.id === session?.user?.id && !isAdmin && t.entryLocked && (
                      <span className="text-[11px] text-muted2" title="Quá hạn đăng ký — liên hệ Quản trị viên để sửa">
                        Đã khoá
                      </span>
                    )}
                    {t.status === "PENDING" && (isAdmin || (t.employee.id === session?.user?.id && !t.entryLocked)) && (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={() => {
                            setShowForm(false);
                            setEditingTrip(t);
                          }}
                          className="text-muted2 hover:text-ink"
                          title="Sửa đăng ký (gõ nhầm)"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleAction(t.id, "cancel")}
                          className="text-muted2 hover:text-brandRed-600"
                          title="Huỷ đăng ký"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface EmployeeOption {
  id: string;
  name: string;
}

interface StopDraft {
  companyName: string;
  address: string;
  expectedTime: string;
  content: string;
}

function emptyStop(): StopDraft {
  return { companyName: "", address: "", expectedTime: "", content: "" };
}

function TripForm({
  onCreated,
  isAdmin,
  currentUserId,
  editingTrip,
  onCancelEdit,
}: {
  onCreated: () => void;
  isAdmin?: boolean;
  currentUserId?: string;
  // Có giá trị -> form ở chế độ SỬA đăng ký hiện có (NVKD tự sửa lỗi gõ nhầm khi còn Chờ duyệt),
  // không có -> chế độ tạo mới như cũ.
  editingTrip?: TripRow;
  onCancelEdit?: () => void;
}) {
  const [visitDate, setVisitDate] = useState(editingTrip ? toDateInputValueVN(editingTrip.visitDate) : "");
  const [stops, setStops] = useState<StopDraft[]>(
    editingTrip
      ? editingTrip.stops.map((s) => ({
          companyName: s.companyName,
          address: s.address ?? "",
          expectedTime: s.expectedTime ?? "",
          content: s.content,
        }))
      : [emptyStop()]
  );
  const [supporterIds, setSupporterIds] = useState<string[]>(
    editingTrip ? editingTrip.supporters.map((s) => s.employee.id) : []
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: employeesData } = useQuery({
    queryKey: ["employees-for-trip-supporters"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ users: EmployeeOption[] }>;
    },
  });
  // Admin đăng ký bổ sung HỘ nhân viên (không bị hạn khoá, được duyệt luôn) — rỗng = cho chính mình.
  const [forEmployeeId, setForEmployeeId] = useState("");
  const ownerId = isAdmin && forEmployeeId ? forEmployeeId : currentUserId;
  const supporterOptions = (employeesData?.users ?? []).filter((u) => u.id !== ownerId);

  function toggleSupporter(id: string) {
    setSupporterIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateStop(index: number, patch: Partial<StopDraft>) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function addStop() {
    setStops((prev) => [...prev, emptyStop()]);
  }
  function removeStop(index: number) {
    setStops((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }
  function moveStop(index: number, direction: -1 | 1) {
    setStops((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const validStops = stops.filter((s) => s.companyName.trim() && s.content.trim());

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const stopsPayload = validStops.map((s) => ({
        companyName: s.companyName,
        address: s.address || null,
        expectedTime: s.expectedTime || null,
        content: s.content,
      }));
      const res = editingTrip
        ? await fetch(`/api/business-trips/${editingTrip.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", visitDate, stops: stopsPayload, supporterEmployeeIds: supporterIds }),
          })
        : await fetch("/api/business-trips", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              visitDate,
              stops: stopsPayload,
              supporterEmployeeIds: supporterIds,
              employeeId: isAdmin && forEmployeeId ? forEmployeeId : undefined,
            }),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || (editingTrip ? "Lưu thay đổi thất bại" : "Đăng ký thất bại"));
      }
      if (!editingTrip) {
        setVisitDate("");
        setStops([emptyStop()]);
        setSupporterIds([]);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card border border-white/10 p-5 rounded-2xl space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      {editingTrip && <p className="text-sm font-medium text-ink">Sửa đăng ký ngày {formatDateVN(editingTrip.visitDate)}</p>}
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
        {isAdmin
          ? "Quản trị viên đăng ký bổ sung không bị giới hạn hạn chót. Đăng ký hộ nhân viên sẽ được duyệt luôn."
          : "Hạn đăng ký: chậm nhất hết ngày thứ Hai của tuần kế tiếp sau tuần chứa ngày đi. Quá hạn sẽ bị khoá, chỉ Quản trị viên bổ sung được."}
      </p>
      {isAdmin && !editingTrip && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground max-w-xs">
          Đăng ký cho
          <select value={forEmployeeId} onChange={(e) => setForEmployeeId(e.target.value)} className="input">
            <option value="">— Chính tôi —</option>
            {(employeesData?.users ?? [])
              .filter((u) => u.id !== currentUserId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground max-w-xs">
        Ngày đi
        <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="input" />
      </label>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Khách hàng ghé trong buổi này — thêm nhiều dòng nếu đi nhiều khách. Sắp đúng thứ tự dự
          kiến ghé để link Google Maps mở đúng lộ trình (có thể tự kéo-thả sắp lại trong Maps).
        </p>
        {stops.map((s, i) => (
          <div key={i} className="glass-card border border-white/5 bg-white/[0.02] p-4 rounded-xl space-y-2.5 hover:border-white/15 transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink">Khách hàng {i + 1}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveStop(i, -1)}
                  disabled={i === 0}
                  className="text-muted2 hover:text-ink disabled:opacity-30"
                  title="Chuyển lên"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStop(i, 1)}
                  disabled={i === stops.length - 1}
                  className="text-muted2 hover:text-ink disabled:opacity-30"
                  title="Chuyển xuống"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeStop(i)}
                  disabled={stops.length <= 1}
                  className="text-muted2 hover:text-brandRed-600 disabled:opacity-30"
                  title="Xoá khách hàng này"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={s.companyName}
                onChange={(e) => updateStop(i, { companyName: e.target.value })}
                placeholder="Tên khách hàng / công ty"
                className="input"
              />
              <input
                type="time"
                value={s.expectedTime}
                onChange={(e) => updateStop(i, { expectedTime: e.target.value })}
                className="input"
              />
              <input
                value={s.address}
                onChange={(e) => updateStop(i, { address: e.target.value })}
                placeholder="Địa chỉ khách hàng (để mở được Google Maps)"
                className="input sm:col-span-2"
              />
              <textarea
                value={s.content}
                onChange={(e) => updateStop(i, { content: e.target.value })}
                rows={2}
                placeholder="Mục đích, nội dung trao đổi..."
                className="input sm:col-span-2"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addStop}
          className="flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm khách hàng khác trong buổi này
        </button>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        Người đi hỗ trợ (không bắt buộc) — cũng được tính điểm KPI &quot;đi gặp khách&quot; cho từng khách trong lượt đi này
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-gray-200 bg-card px-3 py-2 max-h-32 overflow-y-auto">
          {supporterOptions.length === 0 && <span className="text-muted2">Không có đồng nghiệp nào khác</span>}
          {supporterOptions.map((u) => (
            <label key={u.id} className="flex items-center gap-1.5 text-ink2">
              <input type="checkbox" checked={supporterIds.includes(u.id)} onChange={() => toggleSupporter(u.id)} />
              {u.name}
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-brandRed-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !visitDate || validStops.length === 0}
          className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-40 w-fit"
        >
          {saving ? "Đang lưu..." : editingTrip ? "Lưu thay đổi" : "Gửi đăng ký"}
        </button>
        {editingTrip && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-ink2 hover:bg-gray-50"
          >
            Huỷ sửa
          </button>
        )}
      </div>
    </div>
  );
}
