"use client";

import { Fragment, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatDateVN, toDateInputValueVN } from "@/lib/utils";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { buildGoogleMapsMultiStopUrl } from "@/lib/business-trip-maps";
import { TRIP_STATUS_LABEL } from "@/lib/business-trip-report";
import { Check, X, Trash2, Plus, MapPin, ArrowUp, ArrowDown, Pencil, FileText, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { TripReportForm } from "./TripReportForm";
import { TripReportView } from "./TripReportView";
import { TripNextSteps } from "./TripNextSteps";
import { TripPendingBanner } from "./TripPendingBanner";
import { TripBanner } from "./TripBanner";
import { PROVINCES } from "@/lib/vn-provinces";
import { todayVN, visitDay, type PrefillStop, type TripRow } from "./types";

const STATUS_STYLE: Record<TripRow["status"], string> = {
  PENDING: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  REPORTED: "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_8px_rgba(224,163,39,0.2)]",
  NEEDS_REVISION: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]",
  REJECTED: "bg-brandRed-500/15 text-alert border border-brandRed-500/30 shadow-[0_0_8px_rgba(200,16,46,0.2)]",
};

type Tab = "trips" | "next";

export function BusinessTripsPanel({ isAdmin, canApprove = isAdmin }: { isAdmin: boolean; canApprove?: boolean }) {
  const { data: session } = useSession();
  const [employeeId, setEmployeeId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState<PrefillStop | null>(null);
  const [editingTrip, setEditingTrip] = useState<TripRow | null>(null);
  const [reportingTrip, setReportingTrip] = useState<TripRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("trips");
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

  async function handleAction(id: string, action: "approve" | "reject" | "revise" | "cancel") {
    let rejectReason: string | undefined;
    if (action === "reject") {
      rejectReason = window.prompt("Lý do từ chối (không bắt buộc):") || undefined;
    } else if (action === "revise") {
      rejectReason = window.prompt("Cần bổ sung gì? (bắt buộc, nhân viên sẽ thấy nội dung này):")?.trim() || undefined;
      if (!rejectReason) return;
    } else if (action === "cancel") {
      if (!window.confirm("Huỷ đăng ký này?")) return;
    }
    const res = await fetch(`/api/business-trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectReason }),
    });
    if (res.ok) invalidate();
    else {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error || "Không thực hiện được");
    }
  }

  const today = todayVN();
  const canAct = (t: TripRow) => isAdmin || (t.employee.id === session?.user?.id && !t.entryLocked);

  return (
    <div className="space-y-4">
      <TripPendingBanner linkToTrips={false} />
      <TripBanner />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {(
            [
              ["trips", "Đăng ký & báo cáo"],
              ["next", "Việc tiếp theo"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors",
                tab === k ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-white/10 text-muted2 hover:bg-white/10"
              )}
            >
              {label}
            </button>
          ))}
          {isAdmin && tab === "trips" && <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />}
        </div>
        <button
          onClick={() => {
            setEditingTrip(null);
            setReportingTrip(null);
            setPrefill(null);
            setShowForm((v) => !v);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 hover:from-brandRed-500 hover:to-brandRed-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(200,16,46,0.3)] transition-all"
        >
          {showForm ? "Đóng" : "+ Đăng ký đi công tác"}
        </button>
      </div>

      {showForm && (
        <TripForm
          key={prefill ? `prefill-${prefill.companyName}` : "new"}
          isAdmin={isAdmin}
          currentUserId={session?.user?.id}
          prefillStop={prefill ?? undefined}
          onCreated={() => {
            setShowForm(false);
            setPrefill(null);
            setTab("trips");
            invalidate();
          }}
        />
      )}
      {editingTrip && (
        <TripForm
          isAdmin={isAdmin}
          currentUserId={session?.user?.id}
          editingTrip={editingTrip}
          onCreated={() => {
            setEditingTrip(null);
            invalidate();
          }}
          onCancelEdit={() => setEditingTrip(null)}
        />
      )}
      {reportingTrip && (
        <TripReportForm
          key={reportingTrip.id}
          trip={reportingTrip}
          isAdmin={isAdmin}
          onDone={() => {
            setReportingTrip(null);
            invalidate();
          }}
          onCancel={() => {
            setReportingTrip(null);
            invalidate();
          }}
        />
      )}

      {tab === "next" && (
        <TripNextSteps
          isAdmin={isAdmin}
          onRegisterNext={(p) => {
            setPrefill(p);
            setEditingTrip(null);
            setReportingTrip(null);
            setShowForm(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {tab === "trips" && (
        <div className="glass-card border border-white/10 rounded-2xl overflow-x-auto shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
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
                const isOwner = t.employee.id === session?.user?.id;
                const visitedOrToday = visitDay(t.visitDate) <= today;
                const hasReport = t.stops.some((s) => s.outcome);
                const open = expandedId === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr className="hover:bg-white/[0.02] align-top transition-colors">
                      <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">
                        {formatDateVN(t.visitDate)}
                        {t.provinces?.length > 0 && <p className="text-[11px] font-normal text-muted-foreground">{t.provinces.join(", ")}</p>}
                      </td>
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
                              {s.attendee && (
                                <p className="text-[11px] text-sky-300">
                                  Đi gặp: {s.attendee.name}
                                  {(s.supporters?.length ?? 0) > 0 && <span className="text-muted-foreground"> · Hỗ trợ: {s.supporters!.map((p) => p.employee.name).join(", ")}</span>}
                                </p>
                              )}
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
                        <span className={cn("status-badge", STATUS_STYLE[t.status])}>{TRIP_STATUS_LABEL[t.status]}</span>
                        {t.status === "PENDING" && visitedOrToday && (
                          <p className="text-[11px] text-sky-300 mt-0.5">Đã tới ngày đi — nộp báo cáo</p>
                        )}
                        {(t.status === "REJECTED" || t.status === "NEEDS_REVISION") && t.rejectReason && (
                          <p className="text-[11px] text-muted2 mt-0.5">{t.rejectReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <span className="inline-flex flex-wrap items-center justify-end gap-2">
                          {(t.status === "PENDING" || t.status === "NEEDS_REVISION") && (isAdmin || isOwner) && visitedOrToday && (
                            t.entryLocked && !isAdmin ? (
                              <span className="text-[11px] text-muted2" title="Quá hạn nộp báo cáo — liên hệ Quản trị viên">
                                Đã khoá
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setShowForm(false);
                                  setEditingTrip(null);
                                  setReportingTrip(t);
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 font-medium text-amber-300 hover:bg-amber-500/25"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {t.status === "NEEDS_REVISION" ? "Bổ sung báo cáo" : "Nộp báo cáo"}
                              </button>
                            )
                          )}
                          {t.status === "REPORTED" && canApprove && (
                            <>
                              <button
                                onClick={() => handleAction(t.id, "approve")}
                                className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-colors"
                                title="Duyệt báo cáo"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleAction(t.id, "revise")}
                                className="p-1.5 rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 border border-orange-500/30 transition-colors"
                                title="Yêu cầu bổ sung"
                              >
                                <Undo2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {(t.status === "REPORTED" || t.status === "PENDING" || t.status === "NEEDS_REVISION") && canApprove && (
                            <button
                              onClick={() => handleAction(t.id, "reject")}
                              className="p-1.5 rounded-lg bg-brandRed-500/15 text-alert hover:bg-brandRed-500/25 border border-brandRed-500/30 transition-colors"
                              title="Từ chối"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                          {t.status === "PENDING" && canAct(t) && (
                            <>
                              <button
                                onClick={() => {
                                  setShowForm(false);
                                  setReportingTrip(null);
                                  setEditingTrip(t);
                                }}
                                className="text-muted2 hover:text-ink"
                                title="Sửa đăng ký (gõ nhầm)"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleAction(t.id, "cancel")} className="text-muted2 hover:text-alert" title="Huỷ đăng ký">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {hasReport && (
                            <button
                              onClick={() => setExpandedId(open ? null : t.id)}
                              className="inline-flex items-center gap-1 text-muted2 hover:text-ink"
                              title="Xem báo cáo"
                            >
                              Báo cáo {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${t.id}-report`} className="bg-black/20">
                        <td colSpan={isAdmin ? 6 : 5} className="px-4 py-3">
                          <TripReportView trip={t} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
  /** Khách chọn từ danh sách (rỗng = gõ tay) */
  customerId: string;
  /** NVKD đi gặp điểm dừng này; rỗng = người đăng ký */
  attendeeId: string;
  /** Người hỗ trợ của riêng điểm dừng này */
  supporterIds: string[];
}

function emptyStop(): StopDraft {
  return { companyName: "", address: "", expectedTime: "", content: "", customerId: "", attendeeId: "", supporterIds: [] };
}

interface CustomerOption {
  id: string;
  customerCode: string;
  customerName: string;
  address: string | null;
  salesEmployee: { id: string; name: string } | null;
}

function TripForm({
  onCreated,
  isAdmin,
  currentUserId,
  editingTrip,
  prefillStop,
  onCancelEdit,
}: {
  onCreated: () => void;
  isAdmin?: boolean;
  currentUserId?: string;
  // Có giá trị -> form ở chế độ SỬA đăng ký hiện có (NVKD tự sửa lỗi gõ nhầm khi còn Chờ duyệt),
  // không có -> chế độ tạo mới như cũ.
  editingTrip?: TripRow;
  // Đăng ký lần gặp tiếp theo từ "Việc tiếp theo": điền sẵn khách hàng.
  prefillStop?: PrefillStop;
  onCancelEdit?: () => void;
}) {
  const [visitDate, setVisitDate] = useState(editingTrip ? toDateInputValueVN(editingTrip.visitDate) : "");
  const [provinces, setProvinces] = useState<string[]>(editingTrip?.provinces ?? []);
  const [stops, setStops] = useState<StopDraft[]>(
    editingTrip
      ? editingTrip.stops.map((s) => ({
          companyName: s.companyName,
          address: s.address ?? "",
          expectedTime: s.expectedTime ?? "",
          content: s.content,
          customerId: s.customerId ?? "",
          // Điểm dừng cũ (chưa có người đi gặp riêng): người hỗ trợ cả chuyến chuyển thành người hỗ trợ của từng điểm dừng khi sửa.
          attendeeId: s.attendee?.id && s.attendee.id !== editingTrip.employee.id ? s.attendee.id : "",
          supporterIds: s.attendee ? (s.supporters ?? []).map((p) => p.employee.id) : editingTrip.supporters.map((p) => p.employee.id),
        }))
      : prefillStop
        ? [{ ...emptyStop(), companyName: prefillStop.companyName, address: prefillStop.address }]
        : [emptyStop()]
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
  // Admin đăng ký bổ sung HỘ nhân viên (không bị hạn khoá) — rỗng = cho chính mình.
  const [forEmployeeId, setForEmployeeId] = useState("");
  const ownerId = isAdmin && forEmployeeId ? forEmployeeId : currentUserId;
  const employees = employeesData?.users ?? [];
  const ownerName = employees.find((u) => u.id === ownerId)?.name ?? "người đăng ký";

  // Danh sách khách cho ô tên: mọi NVKD thấy cả khách của đồng nghiệp (đăng ký đi hộ / đăng ký chung).
  const { data: customersData } = useQuery({
    queryKey: ["customers-options-for-trip"],
    queryFn: async () => {
      const res = await fetch("/api/customers/options");
      if (!res.ok) throw new Error("Không tải được danh sách khách hàng");
      return res.json() as Promise<{ customers: CustomerOption[] }>;
    },
    staleTime: 5 * 60_000,
  });
  const customers = customersData?.customers ?? [];

  /** Gõ/chọn tên: trùng đúng tên 1 khách trong danh sách thì gắn khách, điền địa chỉ (nếu trống) và đặt người đi gặp = người phụ trách. */
  function changeCompany(index: number, name: string) {
    const c = customers.find((x) => x.customerName.trim().toLowerCase() === name.trim().toLowerCase());
    setStops((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (!c) return { ...s, companyName: name, customerId: "" };
        const owner = c.salesEmployee && c.salesEmployee.id !== ownerId ? c.salesEmployee.id : "";
        return { ...s, companyName: name, customerId: c.id, address: s.address || c.address || "", attendeeId: owner };
      })
    );
  }
  function toggleStopSupporter(index: number, id: string) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, supporterIds: s.supporterIds.includes(id) ? s.supporterIds.filter((x) => x !== id) : [...s.supporterIds, id] } : s)));
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
      if (provinces.length === 0) throw new Error("Chọn tỉnh/TP của chuyến đi");
      const stopsPayload = validStops.map((s) => ({
        companyName: s.companyName,
        address: s.address || null,
        expectedTime: s.expectedTime || null,
        content: s.content,
        customerId: s.customerId || null,
        attendeeId: s.attendeeId || null,
        supporterEmployeeIds: s.supporterIds,
      }));
      const res = editingTrip
        ? await fetch(`/api/business-trips/${editingTrip.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", visitDate, provinces, stops: stopsPayload }),
          })
        : await fetch("/api/business-trips", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              visitDate,
              provinces,
              stops: stopsPayload,
              employeeId: isAdmin && forEmployeeId ? forEmployeeId : undefined,
            }),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || (editingTrip ? "Lưu thay đổi thất bại" : "Đăng ký thất bại"));
      }
      if (!editingTrip) {
        setVisitDate("");
        setProvinces([]);
        setStops([emptyStop()]);
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
          ? "Quản trị viên đăng ký bổ sung không bị giới hạn hạn chót. Đăng ký xong, đi gặp rồi nộp báo cáo (admin nộp hộ thì được duyệt luôn)."
          : "Đăng ký trước khi đi; đi xong nộp báo cáo (kết quả, nội dung, bước tiếp theo, ảnh/định vị) để được duyệt mới tính điểm. Hạn: chậm nhất hết ngày thứ Hai của tuần kế tiếp sau tuần chứa ngày đi, quá hạn sẽ bị khoá, chỉ Quản trị viên bổ sung được."}
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

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">
          Tỉnh/TP đi công tác * <span className="text-muted2">(chọn một hoặc nhiều tỉnh — cả phòng sẽ thấy chuyến đi và các khách trong tỉnh cần gặp)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PROVINCES.map((p) => {
            const on = provinces.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => setProvinces((cur) => (on ? cur.filter((x) => x !== p) : [...cur, p]))}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  on ? "border-amber-400 bg-amber-500/15 font-semibold text-amber-400" : "border-white/15 text-ink2 hover:bg-white/5"
                )}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

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
                  className="text-muted2 hover:text-alert disabled:opacity-30"
                  title="Xoá khách hàng này"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={s.companyName}
                onChange={(e) => changeCompany(i, e.target.value)}
                list="trip-customer-options"
                placeholder="Tên khách hàng / công ty (gõ để chọn từ danh sách)"
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
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                NVKD đi gặp khách này
                <select value={s.attendeeId} onChange={(e) => updateStop(i, { attendeeId: e.target.value })} className="input">
                  <option value="">{ownerName} (người đăng ký)</option>
                  {employees
                    .filter((u) => u.id !== ownerId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
                {s.customerId && customers.find((c) => c.id === s.customerId)?.salesEmployee && (
                  <span className="text-[11px] text-muted2">Phụ trách khách: {customers.find((c) => c.id === s.customerId)?.salesEmployee?.name}. Chọn người khác = đi hộ, điểm gặp khách tính cho người đi.</span>
                )}
              </label>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Người hỗ trợ khách này (không bắt buộc) — hỗ trợ giao tiếp, kỹ thuật; được tính điểm gặp khách cho khách này
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-gray-200 bg-card px-3 py-2 max-h-28 overflow-y-auto">
                  {employees.filter((u) => u.id !== (s.attendeeId || ownerId)).length === 0 && <span className="text-muted2">Không có đồng nghiệp nào khác</span>}
                  {employees
                    .filter((u) => u.id !== (s.attendeeId || ownerId))
                    .map((u) => (
                      <label key={u.id} className="flex items-center gap-1.5 text-ink2">
                        <input type="checkbox" checked={s.supporterIds.includes(u.id)} onChange={() => toggleStopSupporter(i, u.id)} />
                        {u.name}
                      </label>
                    ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        <datalist id="trip-customer-options">
          {customers.map((c) => (
            <option key={c.id} value={c.customerName}>
              {c.customerCode}
              {c.salesEmployee ? ` · ${c.salesEmployee.name}` : ""}
            </option>
          ))}
        </datalist>
        <button
          type="button"
          onClick={addStop}
          className="flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm khách hàng khác trong buổi này
        </button>
      </div>

      <p className="text-[11px] text-muted2">
        Điểm gặp khách tính riêng cho từng khách: NVKD đi gặp và người hỗ trợ của khách đó, mỗi khách 1 điểm. Khách phải có báo cáo &quot;gặp được&quot; và buổi đi được duyệt mới tính.
      </p>
      {error && <p className="text-xs text-alert">{error}</p>}
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
