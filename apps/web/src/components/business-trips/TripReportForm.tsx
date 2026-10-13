"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Crosshair, Trash2, CheckCircle2 } from "lucide-react";
import { cn, formatDateVN, toDateInputValueVN } from "@/lib/utils";
import { compressImage, getCurrentFix, type GeoFix } from "@/lib/client-image";
import { MAX_PHOTOS_PER_STOP, MIN_MET_CONTENT, OUTCOME_LABEL } from "@/lib/business-trip-report";
import type { StopOutcome, TripRow } from "./types";

interface StopDraft {
  stopId: string;
  companyName: string;
  plannedContent: string;
  outcome: StopOutcome | "";
  contactName: string;
  contactPhone: string;
  reportContent: string;
  productInterest: string;
  nextAction: string;
  nextActionDue: string;
  nextActionOwnerId: string;
  checkin: GeoFix | null; // vừa lấy trong lần nộp này
  savedCheckin: boolean; // đã có định vị từ lần nộp trước (được yêu cầu bổ sung)
  photoIds: string[];
  busy: "photo" | "geo" | null;
  note: string | null; // thông báo nhỏ dưới ô (lỗi ảnh/định vị)
}

const OUTCOMES: StopOutcome[] = ["MET", "RESCHEDULED", "NOT_MET"];

/**
 * Form nộp báo cáo công tác theo từng khách: kết quả, người đã gặp, nội dung, bước tiếp theo, ảnh + định vị check-in.
 * Ảnh tải lên ngay khi chọn (gắn vào khách), báo cáo chỉ gửi khi bấm "Nộp báo cáo".
 */
export function TripReportForm({
  trip,
  isAdmin,
  onDone,
  onCancel,
}: {
  trip: TripRow;
  isAdmin: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [stops, setStops] = useState<StopDraft[]>(
    trip.stops.map((s) => ({
      stopId: s.id,
      companyName: s.companyName,
      plannedContent: s.content,
      outcome: s.outcome ?? "",
      contactName: s.contactName ?? "",
      contactPhone: s.contactPhone ?? "",
      reportContent: s.reportContent ?? "",
      productInterest: s.productInterest ?? "",
      nextAction: s.nextAction ?? "",
      nextActionDue: s.nextActionDue ? toDateInputValueVN(s.nextActionDue) : "",
      nextActionOwnerId: s.nextActionOwner?.id ?? trip.employee.id,
      checkin: null,
      savedCheckin: s.checkinLat != null,
      photoIds: s.photos.map((p) => p.id),
      busy: null,
      note: null,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: employeesData } = useQuery({
    queryKey: ["employees-for-trip-supporters"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ users: { id: string; name: string }[] }>;
    },
  });

  function patch(i: number, p: Partial<StopDraft>) {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  }

  async function addPhotos(i: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    patch(i, { busy: "photo", note: null });
    const added: string[] = [];
    let note: string | null = null;
    const room = MAX_PHOTOS_PER_STOP - stops[i].photoIds.length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      try {
        const blob = await compressImage(file);
        const form = new FormData();
        form.append("file", blob, "photo.jpg");
        const res = await fetch(`/api/business-trips/stops/${stops[i].stopId}/photos`, { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Tải ảnh thất bại");
        added.push(json.photo.id as string);
      } catch (e) {
        note = e instanceof Error ? e.message : "Tải ảnh thất bại";
      }
    }
    if (files.length > room) note = note ?? `Tối đa ${MAX_PHOTOS_PER_STOP} ảnh cho mỗi khách`;
    setStops((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, photoIds: [...s.photoIds, ...added], busy: null, note } : s))
    );
  }

  async function removePhoto(i: number, photoId: string) {
    const res = await fetch(`/api/business-trips/photos/${photoId}`, { method: "DELETE" });
    if (res.ok) patch(i, { photoIds: stops[i].photoIds.filter((id) => id !== photoId) });
    else patch(i, { note: "Không xoá được ảnh" });
  }

  async function checkin(i: number) {
    patch(i, { busy: "geo", note: null });
    try {
      const fix = await getCurrentFix();
      patch(i, { checkin: fix, busy: null });
    } catch (e) {
      patch(i, { busy: null, note: e instanceof Error ? e.message : "Không lấy được vị trí" });
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/business-trips/${trip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report",
          stops: stops.map((s) => ({
            stopId: s.stopId,
            outcome: s.outcome || undefined,
            contactName: s.contactName || null,
            contactPhone: s.contactPhone || null,
            reportContent: s.reportContent || null,
            productInterest: s.productInterest || null,
            nextAction: s.nextAction || null,
            nextActionDue: s.nextActionDue || null,
            nextActionOwnerId: s.nextActionOwnerId || null,
            checkin: s.checkin ?? undefined,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const list = Array.isArray(json.errors) ? (json.errors as string[]).join("\n") : json.error;
        throw new Error(list || "Nộp báo cáo thất bại");
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  const ready = stops.every((s) => s.outcome) && !stops.some((s) => s.busy);

  return (
    <div className="glass-card border border-amber-500/30 p-5 rounded-2xl space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      <div>
        <p className="text-sm font-semibold text-ink">
          Báo cáo công tác ngày {formatDateVN(trip.visitDate)}
          {isAdmin && trip.employee.name ? ` — ${trip.employee.name}` : ""}
        </p>
        <p className="text-xs text-muted2 mt-0.5">
          Báo cáo từng khách. Buổi đi chỉ được tính vào Kế hoạch tuần/KPI sau khi Quản trị viên duyệt, và chỉ tính khách có kết quả
          &quot;Đã gặp&quot;.
          {isAdmin ? " Quản trị viên nộp hộ thì được duyệt luôn và không bắt buộc ảnh/định vị." : ""}
        </p>
        {trip.status === "NEEDS_REVISION" && trip.rejectReason && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Yêu cầu bổ sung: {trip.rejectReason}
          </p>
        )}
      </div>

      {stops.map((s, i) => {
        const met = s.outcome === "MET";
        const needNext = s.outcome === "MET" || s.outcome === "RESCHEDULED";
        const hasProof = !!s.checkin || s.savedCheckin || s.photoIds.length > 0;
        return (
          <div key={s.stopId} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {i + 1}. {s.companyName}
              </p>
              <p className="text-xs text-muted2">Dự kiến: {s.plannedContent}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => patch(i, { outcome: o })}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    s.outcome === o
                      ? o === "MET"
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                        : o === "RESCHEDULED"
                          ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                          : "border-brandRed-500/50 bg-brandRed-500/15 text-alert"
                      : "border-white/10 text-muted2 hover:bg-white/10"
                  )}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>

            {s.outcome && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {met && (
                  <>
                    <input
                      value={s.contactName}
                      onChange={(e) => patch(i, { contactName: e.target.value })}
                      placeholder="Người đã gặp (họ tên, chức vụ)"
                      className="input"
                    />
                    <input
                      value={s.contactPhone}
                      onChange={(e) => patch(i, { contactPhone: e.target.value })}
                      placeholder="Số điện thoại người đã gặp"
                      inputMode="tel"
                      className="input"
                    />
                  </>
                )}
                <textarea
                  value={s.reportContent}
                  onChange={(e) => patch(i, { reportContent: e.target.value })}
                  rows={3}
                  placeholder={
                    met
                      ? `Nội dung đã trao đổi, khách phản hồi gì (tối thiểu ${MIN_MET_CONTENT} ký tự)`
                      : s.outcome === "NOT_MET"
                        ? "Lý do không gặp được"
                        : "Lý do hẹn lại"
                  }
                  className="input sm:col-span-2"
                />
                {met && (
                  <input
                    value={s.productInterest}
                    onChange={(e) => patch(i, { productInterest: e.target.value })}
                    placeholder="Nhu cầu / sản phẩm khách quan tâm (không bắt buộc)"
                    className="input sm:col-span-2"
                  />
                )}
                {needNext && (
                  <>
                    <input
                      value={s.nextAction}
                      onChange={(e) => patch(i, { nextAction: e.target.value })}
                      placeholder={s.outcome === "RESCHEDULED" ? "Hẹn gặp lại khi nào, làm gì" : "Bước tiếp theo (vd: gửi báo giá, mang mẫu)"}
                      className="input sm:col-span-2"
                    />
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Hạn thực hiện
                      <input
                        type="date"
                        value={s.nextActionDue}
                        onChange={(e) => patch(i, { nextActionDue: e.target.value })}
                        className="input"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Người phụ trách
                      <select
                        value={s.nextActionOwnerId}
                        onChange={(e) => patch(i, { nextActionOwnerId: e.target.value })}
                        className="input"
                      >
                        <option value={trip.employee.id}>{trip.employee.name}</option>
                        {(employeesData?.users ?? [])
                          .filter((u) => u.id !== trip.employee.id)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            )}

            {met && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                <p className="text-xs font-medium text-ink">
                  Bằng chứng buổi gặp{" "}
                  <span className={cn("font-normal", hasProof ? "text-emerald-400" : "text-amber-400")}>
                    {hasProof ? "— đã đủ" : isAdmin ? "— không bắt buộc khi Quản trị viên nộp hộ" : "— cần ít nhất 1 ảnh hoặc định vị"}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => checkin(i)}
                    disabled={s.busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-ink hover:bg-white/10 disabled:opacity-40"
                  >
                    <Crosshair className="h-3.5 w-3.5 text-amber-400" />
                    {s.busy === "geo" ? "Đang lấy vị trí..." : s.checkin || s.savedCheckin ? "Check-in lại" : "Check-in vị trí"}
                  </button>
                  {s.checkin && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Đã lấy vị trí (±{Math.round(s.checkin.accuracyM)}m)
                    </span>
                  )}
                  {!s.checkin && s.savedCheckin && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Đã check-in ở lần nộp trước
                    </span>
                  )}
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-ink hover:bg-white/10",
                      (s.busy !== null || s.photoIds.length >= MAX_PHOTOS_PER_STOP) && "pointer-events-none opacity-40"
                    )}
                  >
                    <Camera className="h-3.5 w-3.5 text-amber-400" />
                    {s.busy === "photo" ? "Đang tải ảnh..." : `Thêm ảnh (${s.photoIds.length}/${MAX_PHOTOS_PER_STOP})`}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        addPhotos(i, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {s.photoIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {s.photoIds.map((id) => (
                      <div key={id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/business-trips/photos/${id}`}
                          alt="Ảnh buổi gặp"
                          className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(i, id)}
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 p-1 text-alert hover:bg-black"
                          title="Xoá ảnh"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {s.note && <p className="text-xs text-alert">{s.note}</p>}
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="whitespace-pre-line text-xs text-alert">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving || !ready}
          className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-40 w-fit"
        >
          {saving ? "Đang gửi..." : isAdmin ? "Nộp báo cáo & duyệt" : "Nộp báo cáo"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-ink2 hover:bg-white/10"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
