"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

export function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetAndClose() {
    setOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu mới nhập lại không khớp");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Đổi mật khẩu thất bại");
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(resetAndClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink"
        aria-label="Đổi mật khẩu"
      >
        <KeyRound className="h-4 w-4" />
        <span className="hidden sm:inline">Đổi mật khẩu</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={resetAndClose} />
          <div className="absolute right-0 top-full mt-2 w-64 sm:w-72 rounded-lg border border-gray-200 bg-card p-4 shadow-lg z-20 space-y-3">
            {error && <p className="text-xs text-brandRed-600">{error}</p>}
            {success && <p className="text-xs text-success-600">Đổi mật khẩu thành công</p>}
            <input
              type="password"
              placeholder="Mật khẩu hiện tại"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input w-full"
              autoFocus
            />
            <input
              type="password"
              placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input w-full"
            />
            <input
              type="password"
              placeholder="Nhập lại mật khẩu mới"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input w-full"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                className="flex-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
              <button
                onClick={resetAndClose}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-muted-foreground hover:bg-gray-50"
              >
                Huỷ
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
