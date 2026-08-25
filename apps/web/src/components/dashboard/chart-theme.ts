// Hằng số màu dùng chung cho các biểu đồ Recharts trong theme "Trung tâm điều phối"
// (nền tối). Recharts nhận màu qua prop/style trực tiếp (không đọc được class Tailwind),
// nên các giá trị hex ở đây phải khớp tay với bảng màu trong tailwind.config.ts.
export const CHART_GRID_STROKE = "#1e2c45"; // khớp gray-200 mới (viền/gridline)
export const CHART_TICK = { fontSize: 12, fill: "#8b96ab" }; // khớp gray-500 mới (chữ phụ)
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#101c31", // khớp card
  border: "1px solid #1e2c45",
  borderRadius: 8,
  color: "#E9EEF7",
  fontSize: 13,
};
export const LEGEND_STYLE = { fontSize: 12, color: "#c7cede" };
