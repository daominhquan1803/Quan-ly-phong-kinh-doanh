"use client";

import { useQuery } from "@tanstack/react-query";

interface UserRow {
  id: string;
  name: string;
  role: "ADMIN" | "SALES";
  active: boolean;
  amisEmployeeCode: string | null;
}

/** Dropdown lọc theo nhân viên — chỉ hiển thị cho ADMIN (SALES đã mặc định chỉ thấy của mình). */
export function EmployeeFilterSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (employeeId: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["admin-users-filter"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ users: UserRow[] }>;
    },
  });

  // Lọc theo "có gán mã AMIS" (đang thực sự bán hàng) chứ không theo vai trò — chủ tài
  // khoản có thể vừa là ADMIN vừa trực tiếp bán hàng, vẫn cần lọc được đơn của họ.
  const employees = (data?.users ?? []).filter((u) => u.active && u.amisEmployeeCode);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
    >
      <option value="">Tất cả nhân viên</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}
