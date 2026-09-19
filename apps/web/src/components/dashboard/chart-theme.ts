// Hằng số màu dùng chung cho các biểu đồ Recharts. Recharts nhận màu qua prop/style trực tiếp
// (không đọc được class Tailwind) nên dùng biến CSS --c-* của theme (xem styles/globals.css) —
// tự đổi theo chủ đề Sáng/Tối.
export const CHART_GRID_STROKE = "rgb(var(--c-gray-200))"; // viền/gridline
export const CHART_TICK = { fontSize: 12, fill: "rgb(var(--c-gray-500))" }; // chữ phụ
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "rgb(var(--c-card))",
  border: "1px solid rgb(var(--c-gray-200))",
  borderRadius: 8,
  color: "rgb(var(--c-ink))",
  fontSize: 13,
};
export const LEGEND_STYLE = { fontSize: 12, color: "rgb(var(--c-gray-700))" };
