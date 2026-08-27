"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatDateVN } from "@/lib/utils";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { buildGoogleMapsMultiStopUrl } from "@/lib/business-trip-maps";
import { Check, X, Trash2, Plus, MapPin, ArrowUp, ArrowDown } from "lucide-react";

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
}

const STATUS_LABEL: Record<TripRow["status"], string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
};
const STATUS_STYLE: Record<TripRow["status"], string> = {
  PENDING: "bg-warning-500/10 text-warning-500",
  APPROVED: "bg-success-600/10 text-success-600",
  REJECTED: "bg-brandRed-50 text-brandRed-600",
};

export function BusinessTripsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: session } = useSession();
  const [employeeId, setEmployeeId] = useState("");
  const [showForm, setShowForm] = useState(false);
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
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
        >
          {showForm ? "Đóng" : "+ Đăng ký đi công tác"}
        </button>
      </div>

      {showForm && (
        <TripForm currentUserId={session?.user?.id} onCreated={() => { setShowForm(false); invalidate(); }} />
      )}

      <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-muted-foreground">
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
                <tr key={t.id} className="hover:bg-gray-50 align-top">
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
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-500 hover:underline"
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
                          className="text-success-600 hover:text-success-600/80"
                          title="Duyệt"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleAction(t.id, "reject")}
                          className="text-brandRed-600 hover:text-brandRed-700"
                          title="Từ chối"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                    {t.status === "PENDING" && !isAdmin && (
                      <button
                        onClick={() => handleAction(t.id, "cancel")}
                        className="text-muted2 hover:text-brandRed-600"
                        title="Huỷ đăng ký"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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

function TripForm({ onCreated, currentUserId }: { onCreated: () => void; currentUserId?: string }) {
  const [visitDate, setVisitDate] = useState("");
  const [stops, setStops] = useState<StopDraft[]>([emptyStop()]);
  const [supporterIds, setSupporterIds] = useState<string[]>([]);
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
  const supporterOptions = (employeesData?.users ?? []).filter((u) => u.id !== currentUserId);

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
      const res = await fetch("/api/business-trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitDate,
          stops: validStops.map((s) => ({
            companyName: s.companyName,
            address: s.address || null,
            expectedTime: s.expectedTime || null,
            content: s.content,
          })),
          supporterEmployeeIds: supporterIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Đăng ký thất bại");
      }
      setVisitDate("");
      setStops([emptyStop()]);
      setSupporterIds([]);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng ký thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
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
          <div key={i} className="rounded-md border border-gray-200 bg-card p-3 space-y-2">
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
      <button
        onClick={handleSubmit}
        disabled={saving || !visitDate || validStops.length === 0}
        className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-40 w-fit"
      >
        {saving ? "Đang gửi..." : "Gửi đăng ký"}
      </button>
    </div>
  );
}
