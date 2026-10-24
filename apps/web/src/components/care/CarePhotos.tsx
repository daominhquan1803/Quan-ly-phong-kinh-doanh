"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { compressImage } from "@/lib/client-image";
import { MAX_CARE_PHOTOS } from "@/lib/customer-care";

export const photoUrl = (id: string) => `/api/customer-care/photos/${id}`;

/** Ảnh nhỏ bấm để xem to (mở tab mới). */
export function PhotoThumbs({ ids }: { ids?: string[] }) {
  if (!ids || ids.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <a key={id} href={photoUrl(id)} target="_blank" rel="noreferrer" title="Xem ảnh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(id)} alt="Ảnh minh chứng" loading="lazy" className="h-12 w-12 rounded-md border border-gray-200/30 object-cover" />
        </a>
      ))}
    </div>
  );
}

/**
 * Chọn ảnh minh chứng: bấm để chọn/chụp, kéo thả, hoặc dán (Ctrl+V) ảnh vừa cắt bằng công cụ cắt màn hình (Win+Shift+S).
 * Ảnh nén ngay trên trình duyệt rồi tải lên; `ids` là danh sách id ảnh đã tải, gửi kèm khi lưu lần ghi.
 */
export function PhotoPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Giữ danh sách mới nhất cho các lần dán/chọn liên tiếp trong khi đang tải.
  const latest = useRef(ids);
  latest.current = ids;

  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of images) {
        if (latest.current.length >= MAX_CARE_PHOTOS) {
          setError(`Tối đa ${MAX_CARE_PHOTOS} ảnh`);
          break;
        }
        const blob = await compressImage(f);
        const fd = new FormData();
        fd.append("file", blob, "anh.jpg");
        const res = await fetch("/api/customer-care/photos", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Không tải được ảnh");
        latest.current = [...latest.current, json.photo.id as string];
        onChange(latest.current);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    latest.current = latest.current.filter((x) => x !== id);
    onChange(latest.current);
    await fetch(photoUrl(id), { method: "DELETE" }).catch(() => undefined);
  }

  return (
    <div
      tabIndex={0}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) {
          e.preventDefault();
          void addFiles(files);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void addFiles(Array.from(e.dataTransfer.files));
      }}
      className={`rounded-xl border border-dashed p-3 outline-none focus:border-amber-400 ${over ? "border-amber-400 bg-amber-500/10" : ids.length ? "border-gray-200/40" : "border-amber-500/50"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {ids.map((id) => (
          <div key={id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(id)} alt="Ảnh minh chứng" className="h-16 w-16 rounded-md border border-gray-200/30 object-cover" />
            <button
              type="button"
              onClick={() => remove(id)}
              aria-label="Gỡ ảnh"
              className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 p-0.5 text-white hover:bg-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {ids.length < MAX_CARE_PHOTOS && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-gray-200/40 text-[11px] text-ink2 hover:bg-white/5 disabled:opacity-50"
          >
            <ImagePlus className="h-5 w-5" />
            {busy ? "Đang tải" : "Thêm ảnh"}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Chụp màn hình tin nhắn Zalo / nhật ký cuộc gọi / ảnh gặp khách. Trên máy tính: cắt ảnh bằng Win+Shift+S rồi bấm vào khung này và nhấn Ctrl+V. Tối đa {MAX_CARE_PHOTOS} ảnh.
      </p>
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}
    </div>
  );
}
