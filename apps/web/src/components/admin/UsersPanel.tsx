"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound } from "lucide-react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
  active: boolean;
  amisEmployeeCode: string | null;
  quoteAssigneeCode: string | null;
  includeInSalesStats: boolean;
  notifyEmail: string | null;
  phone: string | null;
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
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);

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

  async function patchUser(userId: string, body: Record<string, unknown>) {
    setRowBusy(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Cập nhật thất bại");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
      return false;
    } finally {
      setRowBusy(null);
    }
  }

  async function handleRoleChange(userId: string, role: "ADMIN" | "SALES") {
    await patchUser(userId, { role });
  }

  async function handleToggleActive(userId: string, active: boolean) {
    await patchUser(userId, { active });
  }

  async function handleToggleIncludeInStats(userId: string, includeInSalesStats: boolean) {
    await patchUser(userId, { includeInSalesStats });
  }

  async function handleSubmitResetPassword(userId: string) {
    if (resetPasswordValue.trim().length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    const ok = await patchUser(userId, { password: resetPasswordValue.trim() });
    if (ok) {
      setResetPasswordFor(null);
      setResetPasswordValue("");
    }
  }

  const [amisCodeEdits, setAmisCodeEdits] = useState<Record<string, string>>({});
  const [savingAmisCode, setSavingAmisCode] = useState<string | null>(null);

  async function handleSaveAmisCode(userId: string) {
    const value = amisCodeEdits[userId];
    if (value === undefined) return;
    setSavingAmisCode(userId);
    const ok = await patchUser(userId, { amisEmployeeCode: value || null });
    if (ok) {
      setAmisCodeEdits((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
    setSavingAmisCode(null);
  }

  const [quoteCodeEdits, setQuoteCodeEdits] = useState<Record<string, string>>({});
  const [savingQuoteCode, setSavingQuoteCode] = useState<string | null>(null);

  async function handleSaveQuoteCode(userId: string) {
    const value = quoteCodeEdits[userId];
    if (value === undefined) return;
    setSavingQuoteCode(userId);
    const ok = await patchUser(userId, { quoteAssigneeCode: value || null });
    if (ok) {
      setQuoteCodeEdits((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
    setSavingQuoteCode(null);
  }

  const [notifyEmailEdits, setNotifyEmailEdits] = useState<Record<string, string>>({});
  const [savingNotifyEmail, setSavingNotifyEmail] = useState<string | null>(null);

  async function handleSaveNotifyEmail(userId: string) {
    const value = notifyEmailEdits[userId];
    if (value === undefined) return;
    setSavingNotifyEmail(userId);
    const ok = await patchUser(userId, { notifyEmail: value || null });
    if (ok) {
      setNotifyEmailEdits((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
    setSavingNotifyEmail(null);
  }

  const [phoneEdits, setPhoneEdits] = useState<Record<string, string>>({});
  const [savingPhone, setSavingPhone] = useState<string | null>(null);

  async function handleSavePhone(userId: string) {
    const value = phoneEdits[userId];
    if (value === undefined) return;
    setSavingPhone(userId);
    const ok = await patchUser(userId, { phone: value || null });
    if (ok) {
      setPhoneEdits((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
    setSavingPhone(null);
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

  // Danh sách cho phần alias — không lọc theo vai trò vì chủ tài khoản có thể vừa là ADMIN
  // vừa trực tiếp bán hàng (vd chủ doanh nghiệp), vẫn cần ánh xạ tên như 1 nhân viên kinh doanh.
  const salesUsers = usersData?.users.filter((u) => u.active) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-ink">Danh sách nhân viên</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
          >
            <Plus className="h-4 w-4" /> Thêm nhân viên
          </button>
        </div>

        {showForm && (
          <div className="rounded-lg border border-gray-200 bg-card p-4 mb-4 space-y-3">
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
            <button onClick={handleCreateUser} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400">
              Tạo tài khoản
            </button>
          </div>
        )}

        {error && !showForm && <p className="text-sm text-brandRed-600 mb-3">{error}</p>}

        <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Tên</th>
                <th className="text-left font-medium px-4 py-2.5">Email</th>
                <th className="text-left font-medium px-4 py-2.5">Vai trò</th>
                <th className="text-left font-medium px-4 py-2.5">Trạng thái</th>
                <th className="text-left font-medium px-4 py-2.5">Mã nhân viên AMIS</th>
                <th className="text-left font-medium px-4 py-2.5">Mã Báo giá</th>
                <th className="text-left font-medium px-4 py-2.5">Email nhận thông báo</th>
                <th className="text-left font-medium px-4 py-2.5">Số điện thoại</th>
                <th className="text-left font-medium px-4 py-2.5">Thống kê doanh số</th>
                <th className="text-left font-medium px-4 py-2.5">Mật khẩu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usersData?.users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5 font-medium text-ink">{u.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.role}
                      disabled={rowBusy === u.id}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as "ADMIN" | "SALES")}
                      className="text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2 disabled:opacity-40"
                    >
                      <option value="SALES">Nhân viên kinh doanh</option>
                      <option value="ADMIN">Quản trị viên</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleToggleActive(u.id, !u.active)}
                      disabled={rowBusy === u.id}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${
                        u.active ? "bg-success-600/10 text-success-600" : "bg-gray-200 text-muted-foreground"
                      }`}
                    >
                      {u.active ? "Đang hoạt động" : "Đã khoá"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="vd: DANGTAN"
                        defaultValue={u.amisEmployeeCode ?? ""}
                        onChange={(e) => setAmisCodeEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        className="w-32 text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
                      />
                      {amisCodeEdits[u.id] !== undefined && (
                        <button
                          onClick={() => handleSaveAmisCode(u.id)}
                          disabled={savingAmisCode === u.id}
                          className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
                        >
                          Lưu
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="vd: TAN.DV"
                        defaultValue={u.quoteAssigneeCode ?? ""}
                        onChange={(e) => setQuoteCodeEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        className="w-24 text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
                      />
                      {quoteCodeEdits[u.id] !== undefined && (
                        <button
                          onClick={() => handleSaveQuoteCode(u.id)}
                          disabled={savingQuoteCode === u.id}
                          className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
                        >
                          Lưu
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="vd: tung.nguyen@gmail.com"
                        defaultValue={u.notifyEmail ?? ""}
                        onChange={(e) => setNotifyEmailEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        className="w-44 text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
                      />
                      {notifyEmailEdits[u.id] !== undefined && (
                        <button
                          onClick={() => handleSaveNotifyEmail(u.id)}
                          disabled={savingNotifyEmail === u.id}
                          className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
                        >
                          Lưu
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="vd: 0973786111"
                        defaultValue={u.phone ?? ""}
                        onChange={(e) => setPhoneEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        className="w-32 text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
                      />
                      {phoneEdits[u.id] !== undefined && (
                        <button
                          onClick={() => handleSavePhone(u.id)}
                          disabled={savingPhone === u.id}
                          className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
                        >
                          Lưu
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleToggleIncludeInStats(u.id, !u.includeInSalesStats)}
                      disabled={rowBusy === u.id || !u.amisEmployeeCode}
                      title={!u.amisEmployeeCode ? "Chưa gán mã AMIS nên không tính vào thống kê" : undefined}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${
                        u.includeInSalesStats ? "bg-success-600/10 text-success-600" : "bg-gray-200 text-muted-foreground"
                      }`}
                    >
                      {u.includeInSalesStats ? "Có tính" : "Không tính"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    {resetPasswordFor === u.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Mật khẩu mới"
                          value={resetPasswordValue}
                          onChange={(e) => setResetPasswordValue(e.target.value)}
                          className="w-32 text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSubmitResetPassword(u.id)}
                          disabled={rowBusy === u.id}
                          className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
                        >
                          Lưu
                        </button>
                        <button
                          onClick={() => {
                            setResetPasswordFor(null);
                            setResetPasswordValue("");
                          }}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Huỷ
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setResetPasswordFor(u.id);
                          setResetPasswordValue("");
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-ink"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Đặt lại
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Mã nhân viên AMIS (vd DANGTAN) dùng để đồng bộ đơn hàng tự động khớp đúng người phụ trách — xem tại
          AMIS CRM, thông tin nhân viên. Đổi vai trò/khoá tài khoản áp dụng ngay lập tức; hệ thống luôn giữ lại
          ít nhất 1 quản trị viên đang hoạt động. Cột &quot;Thống kê doanh số&quot;: bật cho tài khoản nào thì doanh số
          của mã AMIS đó mới cộng vào Kế hoạch kinh doanh/Tổng quan — tắt đi nếu mã AMIS này không phải nhân
          viên kinh doanh thật (đơn hàng vẫn đồng bộ về bình thường, chỉ không tính vào thống kê).
          Cột &quot;Email nhận thông báo&quot; là email THẬT (Gmail/Outlook...) — khác với email đăng
          nhập ở cột đầu (thường là địa chỉ nội bộ không nhận được thư) — dùng để gửi nhắc việc khi
          Kế hoạch tuần/KPI tháng sắp đến hạn. Để trống thì chỉ nhận thông báo trong app. Cột
          &quot;Số điện thoại&quot; hiển thị ở mục &quot;Phụ trách đơn hàng&quot; trên Phiếu soạn hàng.
        </p>
      </div>

      <div>
        <h2 className="font-medium text-ink mb-3">
          Ánh xạ tên (alias) — khi Excel AMIS ghi tên nhân viên khác với tài khoản hệ thống
        </h2>
        <div className="rounded-lg border border-gray-200 bg-card p-4 space-y-3">
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
            <button onClick={handleCreateAlias} className="shrink-0 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400">
              Lưu
            </button>
          </div>
          <ul className="text-sm text-ink2 divide-y divide-gray-100">
            {aliasData?.aliases.map((a) => (
              <li key={a.aliasName} className="py-1.5 flex items-center justify-between">
                <span>{a.aliasName}</span>
                <span className="text-muted-foreground">→ {a.employee.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
