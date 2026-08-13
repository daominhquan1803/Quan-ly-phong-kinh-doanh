"use client";

import { useQuery } from "@tanstack/react-query";

interface UserRow {
  id: string;
  name: string;
  role: "ADMIN" | "SALES";
  active: boolean;
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

  const employees = (data?.users ?? []).filter((u) => u.role === "SALES" && u.active);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm rounded-md border border-gray-200 py-2 px-2 focus:outline-none focus:ring-2 focus:ring-navy-900"
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
