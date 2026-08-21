"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortState<T extends string> {
  field: T | null;
  dir: "asc" | "desc";
}

/** Bấm để chuyển sang sắp xếp theo field này — bấm lại field đang chọn để đảo chiều. */
export function toggleSort<T extends string>(prev: SortState<T>, field: T): SortState<T> {
  return prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" };
}

/** Tiêu đề cột bấm được để sắp xếp tăng/giảm dần — dùng chung cho các bảng có nhiều cột số/ngày. */
export function SortableTh<T extends string>({
  field,
  sort,
  onSort,
  align = "left",
  children,
}: {
  field: T;
  sort: SortState<T>;
  onSort: (field: T) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const isActive = sort.field === field;
  const Icon = !isActive ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("font-medium px-4 py-2.5 select-none", align === "right" ? "text-right" : "text-left")}>
      <button
        onClick={() => onSort(field)}
        className={cn("inline-flex items-center gap-1 hover:text-navy-900", align === "right" && "flex-row-reverse")}
      >
        {children}
        <Icon className={cn("h-3.5 w-3.5", isActive ? "text-navy-900" : "text-gray-300")} />
      </button>
    </th>
  );
}

/** Ô tìm kiếm nhỏ đặt ngay dưới tiêu đề cột — dùng chung cho hàng lọc theo từng cột. */
export function FilterInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-7 pr-2 py-1.5 text-xs font-normal rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-navy-900"
      />
    </div>
  );
}
