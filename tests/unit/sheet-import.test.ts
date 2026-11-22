import { describe, expect, it } from "vitest";
import { readXlsx, writeXlsx } from "@/lib/xlsx";
import { readZip, writeZip } from "@/lib/zip";
import { folderName, numberOfFolder, placePhotos } from "@/lib/photo-folders";
import { COLUMNS, parseStock, sheetPieces, sheetRows, templateXlsx } from "@/modules/catalog-admin/sheet";

const header = COLUMNS.map((c) => c.header);
const row = (cells: Partial<Record<(typeof COLUMNS)[number]["key"], string>>) => COLUMNS.map((c) => cells[c.key] ?? "");
const CATS = new Map([["tops", "00000000-0000-4000-8000-000000000001"]]);

describe("zip", () => {
  it("reads back what it wrote, folders left out", () => {
    const zip = writeZip([{ name: "a/" }, { name: "a/b.txt", data: Buffer.from("hello ".repeat(50)) }, { name: "c.txt", data: Buffer.from("₹") }]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["a/b.txt", "c.txt"]);
    expect(files.get("a/b.txt")!.toString()).toBe("hello ".repeat(50));
    expect(files.get("c.txt")!.toString()).toBe("₹");
  });
  it("refuses what isn't a zip", () => {
    expect(() => readZip(Buffer.from("not a zip at all, just some text"))).toThrow();
  });
});

describe("xlsx", () => {
  it("round-trips text, skipping empty cells", () => {
    const file = writeXlsx([{ name: "Pieces", rows: [["A", "B", "C"], ["1", "", "x & <y>"]] }, { name: "Other", rows: [["z"]] }]);
    expect(readXlsx(file)).toEqual([["A", "B", "C"], ["1", "", "x & <y>"]]);
    expect(readXlsx(file, "other")).toEqual([["z"]]);
  });
  it("reads the way Excel saves: shared text, rich text, numbers and gaps", () => {
    const x = (s: string) => Buffer.from(s, "utf8");
    const file = writeZip([
      { name: "xl/workbook.xml", data: x('<workbook xmlns:r="r"><sheets><sheet name="Notes" sheetId="1" r:id="rId1"/><sheet name="Pieces" sheetId="2" r:id="rId2"/></sheets></workbook>') },
      { name: "xl/_rels/workbook.xml.rels", data: x('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>') },
      { name: "xl/sharedStrings.xml", data: x('<sst><si><t>What it is</t></si><si><r><t>Ribbed </t></r><r><rPr><b/></rPr><t>knit</t></r></si><si><t xml:space="preserve">S 2, M 3 &amp; more</t></si></sst>') },
      { name: "xl/worksheets/sheet1.xml", data: x('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>') },
      {
        name: "xl/worksheets/sheet2.xml",
        data: x('<worksheet><sheetData><row r="1"><c r="B1" t="s"><v>0</v></c></row><row r="3"><c r="B3" t="s"><v>1</v></c><c r="C3"><v>1499</v></c><c r="E3" t="s"><v>2</v></c><c r="F3" t="b"><v>1</v></c><c r="G3" s="1"/></row></sheetData></worksheet>'),
      },
    ]);
    expect(readXlsx(file, "Pieces")).toEqual([["", "What it is"], [], ["", "Ribbed knit", "1499", "", "S 2, M 3 & more", "TRUE", ""]]);
  });
  it("explains a file that isn't a spreadsheet", () => {
    expect(() => readXlsx(Buffer.from("name,price\n"))).toThrow(/xlsx/);
  });
  it("makes a template whose header the importer finds", () => {
    const cells = readXlsx(templateXlsx(["Tops", "Co-ord sets"]), "Pieces");
    expect(cells[0]).toEqual(header);
    expect(sheetRows(cells)).toEqual([]);
  });
});

describe("parseStock", () => {
  it("reads sizes and counts", () => {
    expect(parseStock("S 2, M 3, L 1")).toEqual([
      { size: "S", count: 2 },
      { size: "M", count: 3 },
      { size: "L", count: 1 },
    ]);
    expect(parseStock("Free size 4")).toEqual([{ size: "Free size", count: 4 }]);
    expect(parseStock("4")).toEqual([{ size: null, count: 4 }]);
  });
  it("says what's wrong", () => {
    expect(typeof parseStock("")).toBe("string");
    expect(typeof parseStock("S, M")).toBe("string");
  });
});

describe("sheet pieces", () => {
  it("groups a piece's colours, and reads its details from its first row", () => {
    const rows = sheetRows([
      header,
      row({ pieceName: "The Muse Knit", name: "Ribbed V-neck knit sweater", category: "Tops", price: "1499", colour: "Sage", stock: "S 2, M 3" }),
      row({ colour: "Cream", stock: "M 1, L 2" }),
      [],
      row({ name: "Plain tee", price: "₹ 799", stock: "Free size 5" }),
    ]);
    if (typeof rows === "string") throw new Error(rows);
    const [muse, tee] = sheetPieces(rows, CATS);
    expect(muse.problems).toEqual([]);
    expect(muse.lines).toEqual([2, 3]);
    expect(muse.input!.categoryId).toBe(CATS.get("tops"));
    expect(muse.input!.priceMinor).toBe(149900);
    expect(muse.input!.colours.map((c) => c.name)).toEqual(["Sage", "Cream"]);
    expect(muse.input!.sizes.map((s) => s.name)).toEqual(["S", "M", "L"]);
    expect(muse.input!.stock).toEqual([
      [2, 3, null],
      [null, 1, 2],
    ]);
    expect(muse.slug).toBe("the-muse-knit-ribbed-v-neck-knit-sweater");
    expect(tee.input!.priceMinor).toBe(79900);
    expect(tee.input!.colours).toEqual([{ name: null, hex: null, was: null }]);
  });

  it("lists what needs fixing", () => {
    const rows = sheetRows([header, row({ pieceName: "Nameless", category: "Shoes", colour: "Red", stock: "S 1" }), row({ colour: "red", stock: "M 1" })]);
    if (typeof rows === "string") throw new Error(rows);
    const [p] = sheetPieces(rows, CATS);
    expect(p.input).toBeNull();
    expect(p.problems.join(" ")).toMatch(/Shoes/);
    expect(p.problems.join(" ")).toMatch(/twice/);
  });

  it("needs the template's header", () => {
    expect(typeof sheetRows([["Name", "Price"]])).toBe("string");
  });
});

describe("photo folders", () => {
  it("names and reads piece folders", () => {
    expect(folderName(13, "The Muse Knit")).toBe("13 The Muse Knit");
    expect(folderName(null, "Black/White")).toBe("Black White");
    expect(numberOfFolder("13 The Muse Knit")).toBe(13);
    expect(numberOfFolder("Nº 7 – Saanjh")).toBe(7);
    expect(numberOfFolder("Sage")).toBeNull();
  });
  it("puts each photo in its piece and colour, in name order", () => {
    const f = (name: string) => new File(["x"], name);
    const { placed, stray } = placePhotos([
      { file: f("IMG_10.jpg"), path: "Astitva photos/13 The Muse Knit/Sage/IMG_10.jpg" },
      { file: f("IMG_2.jpg"), path: "Astitva photos/13 The Muse Knit/Sage/IMG_2.jpg" },
      { file: f("detail.heic"), path: "Astitva photos/13 The Muse Knit/detail.heic" },
      { file: f(".DS_Store"), path: "Astitva photos/.DS_Store" },
      { file: f("notes.txt"), path: "Astitva photos/13 The Muse Knit/notes.txt" },
      { file: f("loose.jpg"), path: "Astitva photos/loose.jpg" },
    ]);
    expect(placed.map((p) => [p.file.name, p.piece, p.colour])).toEqual([
      ["detail.heic", 13, null],
      ["IMG_2.jpg", 13, "Sage"],
      ["IMG_10.jpg", 13, "Sage"],
    ]);
    expect(stray).toHaveLength(2);
  });
});
