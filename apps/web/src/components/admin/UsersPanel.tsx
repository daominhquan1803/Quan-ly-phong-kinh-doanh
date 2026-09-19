"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Trash2 } from "lucide-react";

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

  async function handleDeleteUser(userId: string, name: string) {
    if (!confirm(`Xoá tài khoản "${name}"? Không thể hoàn tác.`)) return;
    setRowBusy(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Xoá thất bại");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setRowBusy(null);
    }
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-white tracking-wide">Danh Sách Tài Khoản & Nhân Viên</h2>
            <p className="text-xs text-gray-400">Thiết lập quyền hạn, mật khẩu và ánh xạ hệ thống dữ liệu</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-brandRed-600 to-amber-600 hover:from-brandRed-500 hover:to-amber-500 text-white shadow-[0_0_20px_rgba(225,29,72,0.25)] border border-brandRed-500/40 transition-all active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> {showForm ? "Đóng biểu mẫu" : "Thêm nhân viên"}
          </button>
        </div>

        {showForm && (
          <div className="glass-card border border-white/15 p-5 mb-5 rounded-2xl space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                Thêm tài khoản nhân viên mới
              </span>
              <span className="text-xs text-gray-400">Điền thông tin và cấp mật khẩu ban đầu</span>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Họ và tên *</label>
                <input
                  placeholder="vd: Nguyễn Văn A"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Email đăng nhập *</label>
                <input
                  placeholder="vd: anvh@hoanggia.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Vai trò hệ thống</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "ADMIN" | "SALES" }))}
                  className="w-full bg-[#18181b] border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60"
                >
                  <option value="SALES">Nhân viên kinh doanh</option>
                  <option value="ADMIN">Quản trị viên (Admin)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Mật khẩu khởi tạo *</label>
                <input
                  placeholder="Tối thiểu 6 ký tự"
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder:text-gray-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={handleCreateUser}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all font-medium"
              >
                Tạo tài khoản ngay
              </button>
            </div>
          </div>
        )}

        {error && !showForm && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div className="glass-card border border-white/10 rounded-2xl overflow-hidden shadow-[0_12px_40px_rgb(0,0,0,0.5)] backdrop-blur-xl">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.04] border-b border-white/10 text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="text-left py-3.5 px-4">Tên</th>
                  <th className="text-left py-3.5 px-4">Email</th>
                  <th className="text-left py-3.5 px-4">Vai trò</th>
                  <th className="text-left py-3.5 px-4">Trạng thái</th>
                  <th className="text-left py-3.5 px-4">Mã AMIS</th>
                  <th className="text-left py-3.5 px-4">Mã Báo giá</th>
                  <th className="text-left py-3.5 px-4">Email nhận TB</th>
                  <th className="text-left py-3.5 px-4">Số điện thoại</th>
                  <th className="text-left py-3.5 px-4">Thống kê DS</th>
                  <th className="text-left py-3.5 px-4">Mật khẩu</th>
                  <th className="text-right py-3.5 px-4">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {usersData?.users.map((u) => (
                  <tr
                    key={u.id}
                    className={`transition-colors hover:bg-white/[0.03] ${u.active ? "" : "opacity-45 bg-black/20"}`}
                  >
                    <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-brandRed-600/30 to-amber-500/30 border border-white/10 flex items-center justify-center font-bold text-white text-xs">
                          {u.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span>{u.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-300 font-mono whitespace-nowrap">{u.email}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <select
                        value={u.role}
                        disabled={rowBusy === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as "ADMIN" | "SALES")}
                        className={`text-xs rounded-lg border py-1 px-2.5 font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                          u.role === "ADMIN"
                            ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
                            : "bg-blue-500/10 text-blue-300 border-blue-500/30"
                        }`}
                      >
                        <option value="SALES" className="bg-[#18181b] text-white">Nhân viên kinh doanh</option>
                        <option value="ADMIN" className="bg-[#18181b] text-white">Quản trị viên (Admin)</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(u.id, !u.active)}
                        disabled={rowBusy === u.id}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-40 ${
                          u.active
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                            : "bg-gray-500/15 text-gray-400 border border-gray-500/30"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${u.active ? "bg-emerald-400 animate-pulse" : "bg-gray-400"}`} />
                        {u.active ? "Đang hoạt động" : "Đã khoá"}
                      </button>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <input
                          placeholder="vd: DANGTAN"
                          defaultValue={u.amisEmployeeCode ?? ""}
                          onChange={(e) => setAmisCodeEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          className="w-28 text-xs bg-white/[0.05] text-white placeholder:text-gray-600 rounded-lg border border-white/15 py-1 px-2 font-mono focus:outline-none focus:border-amber-500/50"
                        />
                        {amisCodeEdits[u.id] !== undefined && (
                          <button
                            onClick={() => handleSaveAmisCode(u.id)}
                            disabled={savingAmisCode === u.id}
                            className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
                          >
                            Lưu
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <input
                          placeholder="vd: TAN.DV"
                          defaultValue={u.quoteAssigneeCode ?? ""}
                          onChange={(e) => setQuoteCodeEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          className="w-24 text-xs bg-white/[0.05] text-white placeholder:text-gray-600 rounded-lg border border-white/15 py-1 px-2 font-mono focus:outline-none focus:border-amber-500/50"
                        />
                        {quoteCodeEdits[u.id] !== undefined && (
                          <button
                            onClick={() => handleSaveQuoteCode(u.id)}
                            disabled={savingQuoteCode === u.id}
                            className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
                          >
                            Lưu
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <input
                          placeholder="Email nhận thông báo"
                          defaultValue={u.notifyEmail ?? ""}
                          onChange={(e) => setNotifyEmailEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          className="w-40 text-xs bg-white/[0.05] text-white placeholder:text-gray-600 rounded-lg border border-white/15 py-1 px-2 font-mono focus:outline-none focus:border-amber-500/50"
                        />
                        {notifyEmailEdits[u.id] !== undefined && (
                          <button
                            onClick={() => handleSaveNotifyEmail(u.id)}
                            disabled={savingNotifyEmail === u.id}
                            className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
                          >
                            Lưu
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <input
                          placeholder="Số điện thoại"
                          defaultValue={u.phone ?? ""}
                          onChange={(e) => setPhoneEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          className="w-28 text-xs bg-white/[0.05] text-white placeholder:text-gray-600 rounded-lg border border-white/15 py-1 px-2 font-mono focus:outline-none focus:border-amber-500/50"
                        />
                        {phoneEdits[u.id] !== undefined && (
                          <button
                            onClick={() => handleSavePhone(u.id)}
                            disabled={savingPhone === u.id}
                            className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
                          >
                            Lưu
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleIncludeInStats(u.id, !u.includeInSalesStats)}
                        disabled={rowBusy === u.id || !u.amisEmployeeCode}
                        title={!u.amisEmployeeCode ? "Chưa gán mã AMIS nên không tính vào thống kê" : undefined}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-40 ${
                          u.includeInSalesStats
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                            : "bg-gray-500/15 text-gray-400 border border-gray-500/30"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${u.includeInSalesStats ? "bg-amber-400" : "bg-gray-500"}`} />
                        {u.includeInSalesStats ? "Có tính" : "Không tính"}
                      </button>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {resetPasswordFor === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Mật khẩu mới"
                            value={resetPasswordValue}
                            onChange={(e) => setResetPasswordValue(e.target.value)}
                            className="w-28 text-xs bg-white/[0.08] text-white placeholder:text-gray-500 rounded-lg border border-amber-500/50 py-1 px-2 font-mono focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSubmitResetPassword(u.id)}
                            disabled={rowBusy === u.id}
                            className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
                          >
                            Lưu
                          </button>
                          <button
                            onClick={() => {
                              setResetPasswordFor(null);
                              setResetPasswordValue("");
                            }}
                            className="text-[11px] text-gray-400 hover:text-white px-1.5 py-0.5"
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
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-amber-400 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 px-2 py-1 rounded-lg transition-colors"
                        >
                          <KeyRound className="h-3 w-3" /> Đặt lại
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name)}
                        disabled={rowBusy === u.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xoá
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[11px] text-gray-400/80 mt-3 leading-relaxed">
          💡 <span className="text-amber-400 font-medium">Lưu ý:</span> Mã nhân viên AMIS (vd DANGTAN) dùng để đồng bộ đơn hàng tự động khớp đúng người phụ trách — xem tại
          AMIS CRM, thông tin nhân viên. Đổi vai trò/khoá tài khoản áp dụng ngay lập tức; hệ thống luôn giữ lại
          ít nhất 1 quản trị viên đang hoạt động. Cột &quot;Thống kê doanh số&quot;: bật cho tài khoản nào thì doanh số
          của mã AMIS đó mới cộng vào Kế hoạch kinh doanh/Tổng quan. Cột &quot;Email nhận thông báo&quot; dùng để gửi nhắc việc khi
          Kế hoạch tuần/KPI tháng sắp đến hạn.
        </p>
      </div>

      <div className="glass-card border border-white/10 rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-white">
            Ánh Xạ Tên (Alias) — Đồng Bộ Tên Khác Biệt Giữa Excel AMIS & Hệ Thống
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Dành cho trường hợp file Excel AMIS ghi tên nhân viên khác với tài khoản thực tế trên CRM
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              placeholder="Tên trong file Excel (vd: Tấn - KD1)"
              value={aliasForm.aliasName}
              onChange={(e) => setAliasForm((f) => ({ ...f, aliasName: e.target.value }))}
              className="w-full sm:w-80 bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500/60"
            />
            <select
              value={aliasForm.employeeId}
              onChange={(e) => setAliasForm((f) => ({ ...f, employeeId: e.target.value }))}
              className="w-full sm:w-64 bg-[#18181b] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
            >
              <option value="">— Chọn nhân viên đích —</option>
              {salesUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreateAlias}
              className="w-full sm:w-auto shrink-0 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 shadow-[0_0_15px_rgba(245,158,11,0.25)] transition-all font-medium"
            >
              Lưu Ánh Xạ
            </button>
          </div>

          <div className="border-t border-white/5 pt-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              Danh sách ánh xạ hiện hữu:
            </span>
            <ul className="text-xs text-gray-300 divide-y divide-white/5 max-h-52 overflow-y-auto pr-2">
              {aliasData?.aliases && aliasData.aliases.length > 0 ? (
                aliasData.aliases.map((a) => (
                  <li key={a.aliasName} className="py-2 flex items-center justify-between">
                    <span className="font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {a.aliasName}
                    </span>
                    <span className="text-gray-400 flex items-center gap-2">
                      <span className="text-gray-600">chuyển thành</span>
                      <strong className="text-white font-medium">{a.employee.name}</strong>
                    </span>
                  </li>
                ))
              ) : (
                <li className="py-2 text-gray-500 italic">Chưa có ánh xạ tên nào được tạo</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
