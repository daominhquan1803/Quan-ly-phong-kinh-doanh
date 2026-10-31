"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { normalizeVN } from "@/lib/text-normalize";
import { PROVINCES } from "@/lib/vn-provinces";

/** Chọn nhiều tỉnh/TP: bấm vào ô và gõ vài chữ (không cần dấu) để lọc, bấm tên để chọn; tỉnh đã chọn hiện dạng thẻ có nút xoá. */
export function ProvincePicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const n = normalizeVN(q.trim());
    return PROVINCES.filter((p) => !value.includes(p) && (!n || normalizeVN(p).includes(n)));
  }, [q, value]);

  const add = (p: string) => {
    onChange([...value, p]);
    setQ("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/15 bg-card px-2 py-1.5 focus-within:border-amber-500"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((p) => (
          <span key={p} className="flex items-center gap-1 rounded-full border border-amber-400 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
            {p}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== p))} aria-label={`Bỏ ${p}`} className="hover:text-white">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && options.length > 0) {
              e.preventDefault();
              add(options[0]);
            }
            if (e.key === "Backspace" && !q && value.length > 0) onChange(value.slice(0, -1));
          }}
          placeholder={value.length ? "Thêm tỉnh khác..." : "Gõ tên tỉnh/TP, vd: bac ninh"}
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/15 bg-card shadow-xl">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Không có tỉnh phù hợp.</p>
          ) : (
            options.map((p) => (
              <button key={p} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(p)} className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-white/10">
                {p}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
