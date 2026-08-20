"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatDateVN } from "@/lib/utils";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { Check, X, Trash2 } from "lucide-react";

interface TripRow {
  id: string;
  employee: { id: string; name: string };
  visitDate: string;
  expectedTime: string | null;
  companyName: string;
  content: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: { id: string; name: string } | null;
  rejectReason: string | null;
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

      {showForm && <TripForm onCreated={() => { setShowForm(false); invalidate(); }} />}

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Ngày đi</th>
              <th className="text-left font-medium px-4 py-2.5">Giờ dự kiến</th>
              {isAdmin && <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>}
              <th className="text-left font-medium px-4 py-2.5">Công ty đến gặp</th>
              <th className="text-left font-medium px-4 py-2.5">Nội dung</th>
              <th className="text-left font-medium px-4 py-2.5">Trạng thái</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && (data?.trips.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Chưa có đăng ký nào.
                </td>
              </tr>
            )}
            {data?.trips.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{formatDateVN(t.visitDate)}</td>
                <td className="px-4 py-2.5">{t.expectedTime || "—"}</td>
                {isAdmin && <td className="px-4 py-2.5">{t.employee.name}</td>}
                <td className="px-4 py-2.5">{t.companyName}</td>
                <td className="px-4 py-2.5 max-w-xs truncate" title={t.content}>
                  {t.content}
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn("status-badge", STATUS_STYLE[t.status])}>{STATUS_LABEL[t.status]}</span>
                  {t.status === "REJECTED" && t.rejectReason && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{t.rejectReason}</p>
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
                      className="text-gray-400 hover:text-brandRed-600"
                      title="Huỷ đăng ký"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TripForm({ onCreated }: { onCreated: () => void }) {
  const [visitDate, setVisitDate] = useState("");
  const [expectedTime, setExpectedTime] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/business-trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitDate, expectedTime, companyName, content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Đăng ký thất bại");
      }
      setVisitDate("");
      setExpectedTime("");
      setCompanyName("");
      setContent("");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng ký thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        Ngày đi
        <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="input" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        Giờ dự kiến gặp
        <input
          type="time"
          value={expectedTime}
          onChange={(e) => setExpectedTime(e.target.value)}
          className="input"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500 sm:col-span-2">
        Công ty đến gặp
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Tên khách hàng / công ty"
          className="input"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-500 sm:col-span-2">
        Nội dung buổi gặp
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="Mục đích, nội dung trao đổi..."
          className="input"
        />
      </label>
      {error && <p className="text-xs text-brandRed-600 sm:col-span-2">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={saving || !visitDate || !companyName || !content}
        className="rounded-md bg-navy-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2 w-fit"
      >
        {saving ? "Đang gửi..." : "Gửi đăng ký"}
      </button>
    </div>
  );
}
