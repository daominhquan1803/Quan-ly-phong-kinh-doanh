"use client";

import { MapPin, Phone } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import { OUTCOME_LABEL, checkinWarnings, mapsLink } from "@/lib/business-trip-report";
import type { TripRow } from "./types";

const OUTCOME_STYLE = {
  MET: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  RESCHEDULED: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  NOT_MET: "border-brandRed-500/40 bg-brandRed-500/15 text-alert",
} as const;

/** Xem báo cáo công tác đã nộp: kết quả từng khách, bước tiếp theo, ảnh, định vị check-in (kèm cảnh báo cho người duyệt). */
export function TripReportView({ trip }: { trip: TripRow }) {
  const reported = trip.stops.some((s) => s.outcome);
  if (!reported) {
    return <p className="text-xs text-muted2">Buổi đi này được duyệt theo luồng cũ, không có báo cáo chi tiết.</p>;
  }
  return (
    <div className="space-y-3">
      {trip.stops.map((s, i) => {
        const lat = s.checkinLat != null ? Number(s.checkinLat) : null;
        const lng = s.checkinLng != null ? Number(s.checkinLng) : null;
        const warnings =
          lat != null && lng != null
            ? checkinWarnings({ lat, lng, accuracyM: s.checkinAccuracyM, at: s.checkinAt }, trip.visitDate)
            : [];
        return (
          <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink">
                {i + 1}. {s.companyName}
              </p>
              {s.outcome && (
                <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium", OUTCOME_STYLE[s.outcome])}>
                  {OUTCOME_LABEL[s.outcome]}
                </span>
              )}
            </div>
            {(s.contactName || s.contactPhone) && (
              <p className="text-xs text-ink2">
                Đã gặp: <strong className="text-ink">{s.contactName ?? "—"}</strong>
                {s.contactPhone && (
                  <a href={`tel:${s.contactPhone}`} className="ml-2 inline-flex items-center gap-1 text-amber-400 hover:underline">
                    <Phone className="h-3 w-3" /> {s.contactPhone}
                  </a>
                )}
              </p>
            )}
            {s.reportContent && <p className="whitespace-pre-line text-xs text-ink2">{s.reportContent}</p>}
            {s.productInterest && <p className="text-xs text-muted2">Quan tâm: {s.productInterest}</p>}
            {s.nextAction && (
              <p className="text-xs text-ink2">
                <span className="text-muted2">Bước tiếp theo:</span> {s.nextAction}
                {s.nextActionDue && <span className="text-muted2"> — hạn {formatDateVN(s.nextActionDue)}</span>}
                {s.nextActionOwner && <span className="text-muted2"> — {s.nextActionOwner.name}</span>}
                {s.nextActionDoneAt && <span className="text-emerald-400"> — đã xong</span>}
              </p>
            )}
            {lat != null && lng != null && (
              <div className="text-xs">
                <a
                  href={mapsLink(lat, lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-amber-400 hover:text-amber-300"
                >
                  <MapPin className="h-3.5 w-3.5" /> Xem vị trí check-in
                  {s.checkinAccuracyM != null && <span className="font-normal text-muted2"> (±{s.checkinAccuracyM}m)</span>}
                </a>
                {warnings.map((w) => (
                  <span key={w} className="ml-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                    {w}
                  </span>
                ))}
              </div>
            )}
            {s.photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {s.photos.map((p) => (
                  <a key={p.id} href={`/api/business-trips/photos/${p.id}`} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/business-trips/photos/${p.id}`}
                      alt="Ảnh buổi gặp"
                      className="h-20 w-20 rounded-lg border border-white/10 object-cover hover:border-amber-500/50"
                    />
                  </a>
                ))}
              </div>
            )}
            {s.outcome === "MET" && lat == null && s.photos.length === 0 && (
              <p className="text-[11px] text-amber-300">Không có ảnh hoặc định vị (Quản trị viên nộp hộ).</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
