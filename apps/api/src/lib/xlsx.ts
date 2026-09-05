/**
 * A minimal XLSX writer.
 *
 * People asked to export to Excel, and a `.csv` is not that: it has no types,
 * no header row worth the name, and it hands the encoding question to whoever
 * double-clicks it — which is how a column of `+91…` phone numbers becomes a
 * column of arithmetic. This produces a real workbook.
 *
 * It ships no dependency. A `.xlsx` is a ZIP of six small XML parts, and a ZIP
 * is a header, some bytes and a directory; `CompressionStream` (in workerd
 * since 2022) does the only hard part. Adding a packager to a Worker bundle to
 * write 200 lines of XML would be the more expensive choice.
 */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

/**
 * XML 1.0 forbids most C0 control characters outright — not escaped, not at
 * all. A single 0x0B anywhere in a respondent's answer makes the whole workbook
 * unopenable, with an error that blames the file rather than the byte, so they
 * are dropped before anything else.
 */
function xmlText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/**
 * Whether a cell should be written as a number.
 *
 * Deliberately narrow. `0044 7700 900123` and `007` are strings that happen to
 * be digits, and a spreadsheet that eats their leading zeros has damaged the
 * answer. So: no leading zeros, no exponents, and nothing past the 15 digits a
 * double can hold exactly.
 */
function numeric(value: string): number | null {
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return null;
  if (value.replace(/[-.]/g, "").length > 15) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sheetXml(header: string[], rows: string[][]): string {
  const lastCol = columnName(Math.max(header.length, 1) - 1);
  const lastRow = rows.length + 1;

  const cells = (values: string[], rowNumber: number, style: 0 | 1) =>
    values
      .map((value, i) => {
        const ref = `${columnName(i)}${rowNumber}`;
        const s = style ? ` s="${style}"` : "";
        if (!value) return `<c r="${ref}"${s}/>`;
        const n = style === 0 ? numeric(value) : null;
        if (n !== null) return `<c r="${ref}"${s}><v>${n}</v></c>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
      })
      .join("");

  /**
   * Widths are guessed from the widest cell in each column, capped. Excel's
   * default of 8.43 characters turns every answer into `####`, and "resize all
   * the columns yourself" is not an export.
   */
  const widths = header
    .map((title, i) => {
      let widest = title.length;
      for (const row of rows) widest = Math.max(widest, (row[i] ?? "").length);
      const width = Math.min(60, Math.max(10, widest + 2));
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const body = rows.map((row, i) => `<row r="${i + 2}">${cells(row, i + 2, 0)}</row>`).join("");

  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}">` +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    // Frozen header: scrolling a thousand responses without it means losing
    // track of which column is which by row twenty.
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${widths}</cols>` +
    `<sheetData><row r="1">${cells(header, 1, 1)}</row>${body}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
    `</worksheet>`
  );
}

/** Two cell formats: plain, and the bold one the header row uses. */
const STYLES_XML =
  `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  // Excel requires these first two fills to exist, in this order, unused or not.
  `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function workbookXml(sheetName: string): string {
  return (
    `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL_DOC}">` +
    `<sheets><sheet name="${xmlText(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`
  );
}

const CONTENT_TYPES =
  `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ` +
  `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ` +
  `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ` +
  `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL_DOC}/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS =
  `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL_DOC}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_REL_DOC}/styles" Target="styles.xml"/>` +
  `</Relationships>`;

// ── ZIP ──────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const stream = source.pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    // A stored entry is still a valid ZIP, just a larger one.
    return null;
  }
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

async function zip(entries: ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const compressed = await deflate(entry.data);
    const method = compressed ? 8 : 0;
    const payload = compressed ?? entry.data;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, method, true);
    // A fixed 1980-01-01 timestamp. A real clock would make two exports of the
    // same responses differ byte for byte, and nothing reads this field.
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0, true);
    dv.setUint16(10, method, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 33, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, payload.length, true);
    dv.setUint32(24, entry.data.length, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);

    locals.push(local, payload);
    central.push(dir);
    offset += local.length + payload.length;
  }

  const centralSize = central.reduce((n, part) => n + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...central, end];
  const total = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** One worksheet of `rows` under `header`, as `.xlsx` bytes. */
export async function buildXlsx(
  header: string[],
  rows: string[][],
  sheetName = "Responses",
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const text = (value: string) => encoder.encode(value);
  return zip([
    { name: "[Content_Types].xml", data: text(CONTENT_TYPES) },
    { name: "_rels/.rels", data: text(ROOT_RELS) },
    { name: "xl/workbook.xml", data: text(workbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: text(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: text(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: text(sheetXml(header, rows)) },
  ]);
}
