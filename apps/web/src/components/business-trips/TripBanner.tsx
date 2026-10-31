"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plane, ChevronDown, ChevronUp } from "lucide-react";
import { formatDateVN } from "@/lib/utils";
import { joinDenied } from "@/lib/trip-join";
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
 * trong tỉnh cần gặp — kèm NVKD phụ trách, số ngày chưa mua, chưa liên hệ, và nút tham gia / nhờ đi hộ / nhận khách (quyền ở lib/trip-join.ts).
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
              {open && <Suggestions trip={t} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Suggestions({ trip }: { trip: UpcomingTrip }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const me = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMIN";
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["business-trips", "suggestions", trip.id],
    queryFn: async () => {
      const res = await fetch(`/api/business-trips/${trip.id}/suggestions`);
      if (!res.ok) throw new Error("Không tải được khách gợi ý");
      return (await res.json()) as { suggestions: TripSuggestion[] };
    },
    staleTime: 60_000,
  });
  const { data: employeesData } = useQuery({
    queryKey: ["employees-for-trip-supporters"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return (await res.json()) as { users: { id: string; name: string }[] };
    },
  });
  const employees = (employeesData?.users ?? []).filter((u) => u.id !== me);

  const add = useMutation({
    mutationFn: async (v: { customerId: string; attendeeId?: string }) => {
      const res = await fetch(`/api/business-trips/${trip.id}/stops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không thêm được khách vào chuyến");
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["business-trips"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Không thêm được khách vào chuyến"),
  });

  const rows = data?.suggestions ?? [];
  const editable = trip.status === "PENDING" && !!me;

  if (isLoading) return <p className="mt-2 text-xs text-muted-foreground">Đang tìm khách trong tỉnh...</p>;
  if (isError) return <p className="mt-2 text-xs text-alert">Không tải được khách gợi ý.</p>;
  if (rows.length === 0) return <p className="mt-2 text-xs text-muted-foreground">Chưa có khách nào trong tỉnh phù hợp để gợi ý (hoặc đã thêm hết vào chuyến).</p>;
  return (
    <div className="mt-2 space-y-1.5">
      {error && <p className="text-xs text-alert">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/30">
        <table className="min-w-full text-xs">
          <thead className="bg-white/[0.04] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Khách hàng</th>
              <th className="px-3 py-2 text-left font-medium">NVKD phụ trách</th>
              <th className="px-3 py-2 text-left font-medium">Chưa mua</th>
              <th className="px-3 py-2 text-left font-medium">Chưa liên hệ</th>
              {editable && <th className="px-3 py-2 text-left font-medium">Thêm vào chuyến</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => {
              const canSelf = !!me && !joinDenied({ callerId: me, isAdmin, tripOwnerId: trip.employee.id, customerOwnerId: r.employeeId, attendeeId: me });
              const canDelegate = isAdmin || (!!me && r.employeeId === me);
              const label = r.employeeId == null ? "Nhận khách & tham gia" : r.employeeId === me ? "Tham gia chuyến" : "Thêm vào chuyến";
              return (
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
                  {editable && (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canSelf && (
                          <button
                            type="button"
                            disabled={add.isPending}
                            onClick={() => add.mutate({ customerId: r.customerId })}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40"
                          >
                            {label}
                          </button>
                        )}
                        {canDelegate && r.employeeId != null && (
                          <select
                            value=""
                            disabled={add.isPending}
                            onChange={(e) => {
                              const person = employees.find((u) => u.id === e.target.value);
                              if (person && window.confirm(`Nhờ ${person.name} đi gặp ${r.customerName} trong chuyến này? ${person.name} sẽ nhận thông báo và được tính điểm gặp khách.`)) {
                                add.mutate({ customerId: r.customerId, attendeeId: person.id });
                              }
                            }}
                            className="rounded-lg border border-white/15 bg-card px-1.5 py-1 text-[11px] text-ink2"
                            aria-label="Nhờ đi hộ"
                          >
                            <option value="">Nhờ đi hộ…</option>
                            {employees.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {!canSelf && !canDelegate && <span className="text-[11px] text-muted-foreground">—</span>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
