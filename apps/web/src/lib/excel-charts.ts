import JSZip from "jszip";

/**
 * ExcelJS không tạo được biểu đồ nên chèn biểu đồ cột GỐC của Excel vào file .xlsx đã dựng: thêm
 * `xl/charts/chartN.xml`, các mỏ neo trong `drawing` của sheet, quan hệ (rels) và khai báo content-type.
 * Biểu đồ trỏ vào ô của workbook (không nhúng số cứng) nên tự đổi khi người dùng đổi ô chọn trên
 * Dashboard. Có kèm giá trị cache cho trình xem không tính lại công thức.
 */
export interface ChartSeries {
  name: string;
  nameRef: string;
  valuesRef: string;
  values: (number | null)[];
  color: string; // RRGGBB
}

export interface ChartSpec {
  /** Tiêu đề lấy từ 1 ô (đổi theo ô chọn) — ref dạng `Dashboard!$A$40`. */
  title: { ref: string; text: string };
  stacked?: boolean;
  categoriesRef: string;
  categories: string[];
  series: ChartSeries[];
  /** Mỏ neo 0-based: từ ô (fromCol, fromRow) tới đầu ô (toCol, toRow). */
  anchor: { fromCol: number; fromRow: number; toCol: number; toRow: number };
}

const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_CHART = `${NS_R}/chart`;
const REL_DRAWING = `${NS_R}/drawing`;
const CT_CHART = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const CT_DRAWING = "application/vnd.openxmlformats-officedocument.drawing+xml";
// Nhãn trục: tỷ / triệu cho số lớn, số nhỏ giữ nguyên.
const AXIS_FMT = '[>=1000000000]#,##0.0,,,"tỷ";[>=1000000]#,##0.0,,"tr";#,##0';

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const strCache = (values: string[]) =>
  `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("")}</c:strCache>`;
const numCache = (values: (number | null)[]) =>
  `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((v, i) => (v === null || !Number.isFinite(v) ? "" : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`))
    .join("")}</c:numCache>`;

export function chartXml(spec: ChartSpec, axisBase: number): string {
  const [catAx, valAx] = [axisBase, axisBase + 1];
  const sers = spec.series
    .map(
      (s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` +
        `<c:tx><c:strRef><c:f>${esc(s.nameRef)}</c:f>${strCache([s.name])}</c:strRef></c:tx>` +
        `<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>` +
        `<c:cat><c:strRef><c:f>${esc(spec.categoriesRef)}</c:f>${strCache(spec.categories)}</c:strRef></c:cat>` +
        `<c:val><c:numRef><c:f>${esc(s.valuesRef)}</c:f>${numCache(s.values)}</c:numRef></c:val></c:ser>`
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>` +
    `<c:title><c:tx><c:strRef><c:f>${esc(spec.title.ref)}</c:f>${strCache([spec.title.text])}</c:strRef></c:tx><c:overlay val="0"/>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr></c:title>` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="col"/><c:grouping val="${spec.stacked ? "stacked" : "clustered"}"/><c:varyColors val="0"/>${sers}` +
    `<c:gapWidth val="${spec.stacked ? 60 : 80}"/>${spec.stacked ? '<c:overlap val="100"/>' : ""}<c:axId val="${catAx}"/><c:axId val="${valAx}"/></c:barChart>` +
    `<c:catAx><c:axId val="${catAx}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>` +
    `<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="${valAx}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="${valAx}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>` +
    `<c:numFmt formatCode="${esc(AXIS_FMT)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="${catAx}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>` +
    `</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`
  );
}

function anchorXml(spec: ChartSpec, shapeId: number, relId: string): string {
  const { fromCol, fromRow, toCol, toRow } = spec.anchor;
  return (
    `<xdr:twoCellAnchor editAs="oneCell">` +
    `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${shapeId}" name="Biểu đồ ${shapeId}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${relId}"/></a:graphicData></a:graphic>` +
    `</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
  );
}

const nextId = (rels: string) => Math.max(0, ...Array.from(rels.matchAll(/Id="rId(\d+)"/g)).map((m) => Number(m[1]))) + 1;

/** Chèn `charts` vào sheet tên `sheetName` của file xlsx `xlsx`; trả về file mới. */
export async function injectCharts(xlsx: Buffer | ArrayBuffer, sheetName: string, charts: ChartSpec[]): Promise<Buffer> {
  if (charts.length === 0) return Buffer.from(xlsx as ArrayBuffer);
  const zip = await JSZip.loadAsync(xlsx);
  const read = async (p: string) => (await zip.file(p)?.async("string")) ?? null;

  // sheetName -> xl/worksheets/sheetN.xml (qua workbook.xml + workbook.xml.rels)
  const wbXml = (await read("xl/workbook.xml"))!;
  const wbRels = (await read("xl/_rels/workbook.xml.rels"))!;
  const sheetTag = Array.from(wbXml.matchAll(/<sheet\b[^>]*>/g)).map((m) => m[0]).find((t) => t.includes(`name="${esc(sheetName)}"`));
  if (!sheetTag) throw new Error(`Không thấy sheet ${sheetName}`);
  const sheetRid = /r:id="([^"]+)"/.exec(sheetTag)![1];
  const relTag = Array.from(wbRels.matchAll(/<Relationship\b[^>]*>/g)).map((m) => m[0]).find((t) => t.includes(`Id="${sheetRid}"`))!;
  const sheetPath = `xl/${/Target="([^"]+)"/.exec(relTag)![1].replace(/^\/?(xl\/)?/, "")}`;
  const sheetFile = sheetPath.split("/").pop()!;
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`;

  // drawing của sheet (đã có nếu có logo); chưa có thì tạo mới
  let sheetRels = await read(sheetRelsPath);
  let drawingPath: string;
  let createdDrawing = false;
  const drawingRel = sheetRels && Array.from(sheetRels.matchAll(/<Relationship\b[^>]*>/g)).map((m) => m[0]).find((t) => t.includes(REL_DRAWING));
  if (drawingRel) {
    drawingPath = `xl/drawings/${/Target="([^"]+)"/.exec(drawingRel)![1].split("/").pop()}`;
  } else {
    const n = Object.keys(zip.files).filter((f) => /^xl\/drawings\/drawing\d+\.xml$/.test(f)).length + 1;
    drawingPath = `xl/drawings/drawing${n}.xml`;
    createdDrawing = true;
    zip.file(
      drawingPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}"></xdr:wsDr>`
    );
    const rid = nextId(sheetRels ?? "");
    const rel = `<Relationship Id="rId${rid}" Type="${REL_DRAWING}" Target="../drawings/${drawingPath.split("/").pop()}"/>`;
    sheetRels = sheetRels
      ? sheetRels.replace("</Relationships>", `${rel}</Relationships>`)
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`;
    zip.file(sheetRelsPath, sheetRels);
    const sheetXml = (await read(sheetPath))!;
    zip.file(sheetPath, sheetXml.replace("</worksheet>", `<drawing r:id="rId${rid}"/></worksheet>`));
  }

  const drawingRelsPath = `xl/drawings/_rels/${drawingPath.split("/").pop()}.rels`;
  let drawingRels =
    (await read(drawingRelsPath)) ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  let drawingXml = (await read(drawingPath))!;
  let contentTypes = (await read("[Content_Types].xml"))!;

  const existing = Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f)).length;
  const shapeBase = 100;
  let anchors = "";
  charts.forEach((spec, i) => {
    const num = existing + i + 1;
    zip.file(`xl/charts/chart${num}.xml`, chartXml(spec, 500000 + num * 10));
    const rid = nextId(drawingRels);
    drawingRels = drawingRels.replace("</Relationships>", `<Relationship Id="rId${rid}" Type="${REL_CHART}" Target="../charts/chart${num}.xml"/></Relationships>`);
    anchors += anchorXml(spec, shapeBase + num, `rId${rid}`);
    contentTypes = contentTypes.replace("</Types>", `<Override PartName="/xl/charts/chart${num}.xml" ContentType="${CT_CHART}"/></Types>`);
  });
  drawingXml = drawingXml.replace(/<\/xdr:wsDr>\s*$/, `${anchors}</xdr:wsDr>`);
  if (createdDrawing) {
    contentTypes = contentTypes.replace("</Types>", `<Override PartName="/${drawingPath}" ContentType="${CT_DRAWING}"/></Types>`);
  }
  zip.file(drawingPath, drawingXml);
  zip.file(drawingRelsPath, drawingRels);
  zip.file("[Content_Types].xml", contentTypes);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
