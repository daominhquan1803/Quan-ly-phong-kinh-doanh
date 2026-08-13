"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
  active: boolean;
}
interface AliasRow {
  aliasName: string;
  employee: { name: string };
}

export function UsersPanel() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "SALES" as "ADMIN" | "SALES", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [aliasForm, setAliasForm] = useState({ aliasName: "", employeeId: "" });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Không tải được danh sách");
      return res.json() as Promise<{ users: UserRow[] }>;
    },
  });

  const { data: aliasData } = useQuery({
    queryKey: ["admin-aliases"],
    queryFn: async () => {
      const res = await fetch("/api/admin/aliases");
      if (!res.ok) throw new Error("Không tải được alias");
      return res.json() as Promise<{ aliases: AliasRow[] }>;
    },
  });

  async function handleCreateUser() {
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Tạo thất bại");
      setForm({ name: "", email: "", role: "SALES", password: "" });
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    }
  }

  async function handleCreateAlias() {
    if (!aliasForm.aliasName.trim() || !aliasForm.employeeId) return;
    await fetch("/api/admin/aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aliasForm),
    });
    setAliasForm({ aliasName: "", employeeId: "" });
    await queryClient.invalidateQueries({ queryKey: ["admin-aliases"] });
  }

  const salesUsers = usersData?.users.filter((u) => u.role === "SALES") ?? [];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900">Danh sách nhân viên</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
          >
            <Plus className="h-4 w-4" /> Thêm nhân viên
          </button>
        </div>

        {showForm && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 mb-4 space-y-3">
            {error && <p className="text-sm text-brandRed-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Họ tên" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" />
              <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input" />
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "ADMIN" | "SALES" }))} className="input">
                <option value="SALES">Nhân viên kinh doanh</option>
                <option value="ADMIN">Quản trị viên</option>
              </select>
              <input
                placeholder="Mật khẩu tạm"
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="input"
              />
            </div>
            <button onClick={handleCreateUser} className="rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
              Tạo tài khoản
            </button>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Tên</th>
                <th className="text-left font-medium px-4 py-2.5">Email</th>
                <th className="text-left font-medium px-4 py-2.5">Vai trò</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usersData?.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{u.email}</td>
                  <td className="px-4 py-2.5">{u.role === "ADMIN" ? "Quản trị viên" : "Nhân viên kinh doanh"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="font-medium text-gray-900 mb-3">
          Ánh xạ tên (alias) — khi Excel AMIS ghi tên nhân viên khác với tài khoản hệ thống
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              placeholder="Tên trong file Excel (vd: Tấn - KD1)"
              value={aliasForm.aliasName}
              onChange={(e) => setAliasForm((f) => ({ ...f, aliasName: e.target.value }))}
              className="input"
            />
            <select
              value={aliasForm.employeeId}
              onChange={(e) => setAliasForm((f) => ({ ...f, employeeId: e.target.value }))}
              className="input"
            >
              <option value="">— Chọn nhân viên —</option>
              {salesUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button onClick={handleCreateAlias} className="shrink-0 rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
              Lưu
            </button>
          </div>
          <ul className="text-sm text-gray-700 divide-y divide-gray-100">
            {aliasData?.aliases.map((a) => (
              <li key={a.aliasName} className="py-1.5 flex items-center justify-between">
                <span>{a.aliasName}</span>
                <span className="text-gray-500">→ {a.employee.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
