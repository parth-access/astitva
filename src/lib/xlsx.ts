import { readZip, writeZip } from "./zip";

/**
 * Reading and writing plain spreadsheets (.xlsx): text and numbers only, no
 * formatting beyond a bold header. Enough for a template Krishna fills in
 * Excel, Google Sheets or Numbers, and for reading it back.
 */

export type Sheet = {
  name: string;
  rows: string[][];
  /** Column widths in characters. */
  widths?: number[];
  /** A drop-down list for a column (0-based), from row 2 down. */
  choices?: { column: number; options: string[] }[];
};

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const unescape = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });

/** "A" for 0, "AB" for 27. */
export function columnName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** 0 for "A", 27 for "AB". */
function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v === "") return "";
          const ref = `${columnName(c)}${r + 1}`;
          const style = r === 0 ? ' s="1"' : ' s="2"';
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escape(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const lists = sheet.choices?.length
    ? `<dataValidations count="${sheet.choices.length}">${sheet.choices
        .map(
          ({ column, options }) =>
            `<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${columnName(column)}2:${columnName(column)}1000"><formula1>"${escape(options.join(","))}"</formula1></dataValidation>`,
        )
        .join("")}</dataValidations>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData>${lists}</worksheet>`;
}

/** An .xlsx file with these sheets, the first row of each in bold. */
export function writeXlsx(sheets: Sheet[]): Buffer {
  const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  const files = [
    {
      name: "[Content_Types].xml",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    },
    {
      name: "_rels/.rels",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${ns}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((s, i) => `<sheet name="${escape(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${ns}>${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      // Style 1: bold header. Style 2: text that wraps, top-aligned.
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" applyFont="1"><alignment vertical="top" wrapText="1"/></xf><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml: sheetXml(s) })),
  ];
  return writeZip(files.map((f) => ({ name: f.name, data: Buffer.from(f.xml, "utf8") })));
}

/** The text of every <t> inside a piece of XML (a rich-text cell has several). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");

/**
 * The cells of a workbook's first sheet (or the sheet named `prefer`), as
 * text, row by row. Numbers come back as written ("3499"); empty cells as "".
 */
export function readXlsx(file: Buffer, prefer?: string): string[][] {
  let parts: Map<string, Buffer>;
  try {
    parts = readZip(file);
  } catch {
    throw new Error("That isn't an Excel file (.xlsx). In Excel or Google Sheets, save or download it as .xlsx.");
  }
  const text = (name: string) => parts.get(name)?.toString("utf8");
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("That isn't an Excel file (.xlsx). In Excel or Google Sheets, save or download it as .xlsx.");

  // Which file holds the sheet: workbook.xml names it by relationship id.
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    name: unescape(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? ""),
    rid: /\br:id="([^"]*)"/.exec(m[1])?.[1] ?? /\bid="([^"]*)"/.exec(m[1])?.[1] ?? "",
  }));
  const chosen = sheets.find((s) => prefer && s.name.trim().toLowerCase() === prefer.toLowerCase()) ?? sheets[0];
  const rels = text("xl/_rels/workbook.xml.rels") ?? "";
  const target = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((m) => ({ id: /\bId="([^"]*)"/.exec(m[1])?.[1], target: /\bTarget="([^"]*)"/.exec(m[1])?.[1] }))
    .find((r) => r.id === chosen?.rid)?.target;
  const path = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "xl/worksheets/sheet1.xml";
  const sheet = text(path);
  if (!sheet) throw new Error("The spreadsheet has no sheet we can read.");

  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    // Phonetic hints (<rPh>) are not part of the text.
    textOf(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")),
  );

  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(/\br="(\d+)"/.exec(row[1])?.[1] ?? rows.length + 1) - 1;
    const cells: string[] = [];
    let next = 0;
    for (const cell of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/i.exec(cell[1])?.[1];
      const c = ref ? columnIndex(ref) : next;
      next = c + 1;
      const type = /\bt="([^"]*)"/.exec(cell[1])?.[1];
      const body = cell[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "b") value = v === "1" ? "TRUE" : v === "0" ? "FALSE" : "";
      else if (v !== undefined) value = unescape(v);
      cells[c] = value.trim();
    }
    rows[r] = Array.from(cells, (v) => v ?? "");
  }
  // Rows are placed by number, so a formatted but empty row far down (Excel can write row 1048576)
  // would leave a million gaps: stop at the last row that has text.
  let last = rows.length - 1;
  while (last >= 0 && !rows[last]?.some(Boolean)) last--;
  const out: string[][] = [];
  for (let i = 0; i <= last; i++) out.push(rows[i] ?? []);
  return out;
}
