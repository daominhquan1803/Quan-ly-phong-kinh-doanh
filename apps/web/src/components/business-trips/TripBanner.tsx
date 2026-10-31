"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plane, ChevronDown, ChevronUp } from "lucide-react";
import { formatDateVN } from "@/lib/utils";
import type { TripSuggestion } from "@/lib/trip-suggestions";

interface UpcomingTrip {
  id: string;
  visitDate: string;
  status: string;
  provinces: string[];
  employee: { id: string; name: string };
  stops: { companyName: string }[];
}

const dm = (iso: string) => formatDateVN(iso).slice(0, 5);
const days = (n: number | null, none: string) => (n == null ? none : n === 0 ? "hôm nay" : `${n} ngày`);

/**
 * Bảng thông báo chung đầu trang Đăng ký công tác (mọi người thấy): các chuyến công tác sắp đi. Mở từng chuyến để xem khách
 * trong tỉnh cần gặp — kèm NVKD phụ trách, số ngày chưa mua, chưa liên hệ. (Nút tham gia / nhờ đi hộ / nhận khách làm ở bước sau.)
 */
export function TripBanner() {
  const { data } = useQuery({
    queryKey: ["business-trips", "upcoming"],
    queryFn: async () => {
      const res = await fetch("/api/business-trips/upcoming");
      if (!res.ok) throw new Error("Không tải được các chuyến sắp đi");
      return (await res.json()) as { trips: UpcomingTrip[] };
    },
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const trips = data?.trips ?? [];
  if (trips.length === 0) return null;

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-sky-300">
        <Plane className="h-4 w-4" /> Chuyến công tác sắp tới của phòng
      </p>
      <div className="divide-y divide-white/10">
        {trips.map((t) => {
          const hasProvince = t.provinces.length > 0;
          const open = openId === t.id;
          return (
            <div key={t.id} className="py-2">
              <button
                type="button"
                disabled={!hasProvince}
                onClick={() => setOpenId(open ? null : t.id)}
                className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-default"
              >
                <span className="text-sm text-ink">
                  Ngày <b>{dm(t.visitDate)}</b> · <b>{t.employee.name}</b> đi công tác{hasProvince ? ` tại ${t.provinces.join(", ")}` : ""}
                  {hasProvince && <span className="text-sky-300"> — gợi ý các khách cần gặp</span>}
                </span>
                {hasProvince && (open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted2" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted2" />)}
              </button>
              {open && <Suggestions tripId={t.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Suggestions({ tripId }: { tripId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["business-trips", "suggestions", tripId],
    queryFn: async () => {
      const res = await fetch(`/api/business-trips/${tripId}/suggestions`);
      if (!res.ok) throw new Error("Không tải được khách gợi ý");
      return (await res.json()) as { suggestions: TripSuggestion[] };
    },
    staleTime: 60_000,
  });
  const rows = data?.suggestions ?? [];

  if (isLoading) return <p className="mt-2 text-xs text-muted-foreground">Đang tìm khách trong tỉnh...</p>;
  if (isError) return <p className="mt-2 text-xs text-alert">Không tải được khách gợi ý.</p>;
  if (rows.length === 0) return <p className="mt-2 text-xs text-muted-foreground">Chưa có khách nào trong tỉnh phù hợp để gợi ý.</p>;
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-white/5 bg-black/30">
      <table className="min-w-full text-xs">
        <thead className="bg-white/[0.04] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Khách hàng</th>
            <th className="px-3 py-2 text-left font-medium">NVKD phụ trách</th>
            <th className="px-3 py-2 text-left font-medium">Chưa mua</th>
            <th className="px-3 py-2 text-left font-medium">Chưa liên hệ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => (
            <tr key={r.customerId}>
              <td className="px-3 py-2">
                <p className="font-medium text-ink">{r.customerName}</p>
                {r.address && <p className="text-[11px] text-muted-foreground">{r.address}</p>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{r.employeeId ? r.employeeName : <span className="text-amber-400">Chưa phân</span>}</td>
              <td className="px-3 py-2 whitespace-nowrap text-ink2">{days(r.daysSinceOrder, "chưa mua")}</td>
              <td className={r.daysSinceTouch == null || r.daysSinceTouch > 60 ? "px-3 py-2 whitespace-nowrap text-alert" : "px-3 py-2 whitespace-nowrap text-ink2"}>
                {days(r.daysSinceTouch, "chưa liên hệ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
