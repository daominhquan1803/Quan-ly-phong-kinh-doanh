// Lucian UX/UI Prompt #439 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#439
// Lucian UX/UI Prompt #440 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#440
import "./lucian.css";

const WIDTHS = ["92%", "76%", "84%", "58%", "88%", "70%"];

/** Khung chờ lấp lánh thay cho chữ "Đang tải...". Chữ vẫn được đọc cho trình đọc màn hình. */
export function Skeleton({ label = "Đang tải...", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <span className="ux u439-sk" role="status" aria-busy="true">
      <span className="ux-sr">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <i key={i} aria-hidden="true" style={{ width: WIDTHS[i % WIDTHS.length] }} />
      ))}
    </span>
  );
}

/** Thư mục trống bồng bềnh thay cho dòng chữ "Chưa có dữ liệu". */
export function EmptyState({ title }: { title: React.ReactNode }) {
  return (
    <span className="ux u440">
      <svg className="u440-il" viewBox="0 0 160 120" aria-hidden="true">
        <ellipse className="sh" cx="80" cy="116" rx="50" ry="5" />
        <path className="sp" d="M138 22l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8z" />
        <path className="sp" d="M20 40l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z" />
        <path className="sp" d="M128 70l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
        <path className="bk" d="M28 34a8 8 0 0 1 8-8h22a6 6 0 0 1 4.6 2.2l4.6 5.8H124a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8z" />
        <path className="fr" d="M22 56a8 8 0 0 1 8-8h100a8 8 0 0 1 8 8.6l-4.4 44a8 8 0 0 1-8 7.4H34.4a8 8 0 0 1-8-7.4z" />
        <path className="fh" d="M30 48h100a8 8 0 0 1 8 8.6l-.3 3H22.1l-.1-3.6A8 8 0 0 1 30 48z" />
      </svg>
      <b>{title}</b>
    </span>
  );
}
