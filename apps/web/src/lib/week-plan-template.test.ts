import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildWeekPlanTemplate } from "./week-plan-template";
import { IMPORT_COLUMNS, mapImportColumns, METRIC_IMPORT_LABEL } from "./week-plan-entry";
import { matchMetricFromSectionLabel } from "./week-plan";

describe("file Excel mẫu Kế hoạch tuần", () => {
  it("bộ đọc nhận đủ mọi cột của file mẫu, không nhầm cột", async () => {
    const wb = XLSX.read(await buildWeekPlanTemplate(), { type: "buffer" });
    expect(wb.SheetNames[0]).toBe("KẾT QUẢ");
    const [headerRow] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["KẾT QUẢ"], { header: 1, raw: true, defval: "" });
    const headers = headerRow.map((h) => String(h).trim());
    const idx = mapImportColumns(headers);
    const keys = (Object.keys(IMPORT_COLUMNS) as (keyof typeof IMPORT_COLUMNS)[]).filter((k) => k !== "contactInfo");
    // mỗi cột nằm đúng vị trí theo thứ tự mẫu; cột "file cũ" không có trong mẫu
    keys.forEach((k, i) => expect(idx[k], k).toBe(i));
    expect(idx.contactInfo).toBe(-1);
  });
  it("nhãn Mục trong danh sách chọn được bộ đọc hiểu", () => {
    expect(matchMetricFromSectionLabel(METRIC_IMPORT_LABEL.NEW_CONTACT)).toBe("NEW_CONTACT");
    expect(matchMetricFromSectionLabel(METRIC_IMPORT_LABEL.NEW_MEETING)).toBe("NEW_MEETING");
  });
});
