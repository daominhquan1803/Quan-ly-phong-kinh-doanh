import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { SaxesParser } from "saxes";
import { injectCharts, chartXml, type ChartSpec } from "./excel-charts";

const SPEC: ChartSpec = {
  title: { ref: "Dashboard!$A$30", text: "DOANH SỐ — Cả phòng" },
  categoriesRef: "Dashboard!$B$14:$B$15",
  categories: ["Doanh số đơn hàng", "Doanh số đi hàng"],
  series: [
    { name: "10/2026", nameRef: "Dashboard!$C$13", valuesRef: "Dashboard!$C$14:$C$15", values: [100, null], color: "1D4ED8" },
    { name: "09/2026", nameRef: "Dashboard!$D$13", valuesRef: "Dashboard!$D$14:$D$15", values: [80, 50.5], color: "60A5FA" },
  ],
  anchor: { fromCol: 0, fromRow: 30, toCol: 7, toRow: 48 },
};

// PNG 1x1 hợp lệ — để thử nhánh sheet ĐÃ có drawing (logo) như file thật.
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==";

function assertWellFormed(xml: string) {
  const p = new SaxesParser({ xmlns: true });
  p.on("error", (e) => {
    throw e;
  });
  p.write(xml).close();
}

async function workbookBuffer(withImage: boolean) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Dashboard");
  sheet.getCell("B14").value = "Doanh số đơn hàng";
  sheet.getCell("C14").value = 100;
  wb.addWorksheet("Phụ");
  if (withImage) {
    const id = wb.addImage({ base64: PNG_1X1, extension: "png" });
    sheet.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 10, height: 10 } });
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("chartXml", () => {
  it("XML hợp lệ, có tiêu đề trỏ ô, tên series + nhóm cột; ký tự đặc biệt được escape", () => {
    const xml = chartXml({ ...SPEC, categories: ["A & B", "<C>"] }, 1000);
    assertWellFormed(xml);
    expect(xml).toContain("<c:grouping val=\"clustered\"/>");
    expect(xml).toContain("<c:f>Dashboard!$A$30</c:f>");
    expect(xml).toContain("A &amp; B");
    expect(xml).not.toContain("<C>");
    // điểm null không sinh <c:pt>
    expect(xml.match(/<c:numCache>[\s\S]*?<\/c:numCache>/)![0]).not.toContain('idx="1"');
  });
  it("stacked: có overlap 100", () => {
    expect(chartXml({ ...SPEC, stacked: true }, 1000)).toContain('<c:overlap val="100"/>');
  });
});

describe("injectCharts", () => {
  for (const withImage of [true, false]) {
    it(`sheet ${withImage ? "đã có" : "chưa có"} drawing: thêm chart, rels, content-type, mỏ neo; mọi phần XML hợp lệ`, async () => {
      const out = await injectCharts(await workbookBuffer(withImage), "Dashboard", [SPEC, { ...SPEC, anchor: { ...SPEC.anchor, fromCol: 8, toCol: 14 } }]);
      const zip = await JSZip.loadAsync(out);

      const charts = Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f));
      expect(charts.sort()).toEqual(["xl/charts/chart1.xml", "xl/charts/chart2.xml"]);
      for (const c of charts) assertWellFormed(await zip.file(c)!.async("string"));

      const ct = await zip.file("[Content_Types].xml")!.async("string");
      assertWellFormed(ct);
      expect(ct).toContain('PartName="/xl/charts/chart1.xml"');
      expect(ct).toContain('PartName="/xl/charts/chart2.xml"');
      expect(ct).toContain('PartName="/xl/drawings/drawing1.xml"');

      const drawing = await zip.file("xl/drawings/drawing1.xml")!.async("string");
      assertWellFormed(drawing);
      expect(drawing.match(/<xdr:graphicFrame/g)).toHaveLength(2);
      if (withImage) expect(drawing).toContain("<xdr:pic>"); // logo vẫn còn

      const rels = await zip.file("xl/drawings/_rels/drawing1.xml.rels")!.async("string");
      assertWellFormed(rels);
      expect(rels.match(/relationships\/chart"/g)).toHaveLength(2);
      // mỗi r:id trong mỏ neo phải có trong rels, và id không trùng nhau
      const ids = [...drawing.matchAll(/c:chart [^>]*r:id="(rId\d+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(2);
      for (const id of ids) expect(rels).toContain(`Id="${id}"`);
      if (!withImage) expect(await zip.file("xl/worksheets/sheet1.xml")!.async("string")).toContain("<drawing r:id=");

      // ExcelJS vẫn đọc lại được file sau khi chèn
      const again = new ExcelJS.Workbook();
      await again.xlsx.load(out as unknown as ExcelJS.Buffer);
      expect(again.getWorksheet("Dashboard")!.getCell("C14").value).toBe(100);
    });
  }

  it("không có biểu đồ -> giữ nguyên nội dung; sheet không tồn tại -> báo lỗi", async () => {
    const buf = await workbookBuffer(false);
    expect((await injectCharts(buf, "Dashboard", [])).length).toBe(buf.byteLength);
    await expect(injectCharts(buf, "Không có", [SPEC])).rejects.toThrow();
  });
});
