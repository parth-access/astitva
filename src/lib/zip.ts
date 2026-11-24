import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Just enough of the zip format for spreadsheets (an .xlsx is a zip of XML
 * files) and for a download of empty photo folders. No zip64, encryption or
 * multi-part archives: files that need them are refused.
 */

export type ZipEntry = { name: string; data?: Buffer };

const MAX_ENTRY = 50 * 1024 * 1024;
/** All the files together, unpacked: a spreadsheet is far smaller. */
const MAX_TOTAL = 80 * 1024 * 1024;

/** The files in a zip by name. Folders are left out. */
export function readZip(zip: Buffer): Map<string, Buffer> {
  // The end-of-directory record sits at the very end, after a comment of up to 64 KB.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a zip file.");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("This file is damaged.");
    const method = zip.readUInt16LE(at + 10);
    const packed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const skip = nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + skip;
    if (name.endsWith("/")) continue;
    total += size;
    if (packed === 0xffffffff || size > MAX_ENTRY || total > MAX_TOTAL) throw new Error("This file is too big to read.");
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error("This file is damaged.");
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + packed);
    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw, { maxOutputLength: Math.min(MAX_ENTRY, MAX_TOTAL - total + size) }));
    else throw new Error("This file uses a kind of compression we can't read.");
  }
  return files;
}

/** A zip of these files; a name ending in "/" (with no data) is an empty folder. */
export function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const plain = data ?? Buffer.alloc(0);
    const packed = plain.length ? deflateRawSync(plain) : plain;
    const method = plain.length ? 8 : 0;
    const crc = crc32(plain);

    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version needed
    head.writeUInt16LE(0x0800, 6); // names are UTF-8
    head.writeUInt16LE(method, 8);
    head.writeUInt16LE(0, 10); // time
    head.writeUInt16LE(0x21, 12); // date: 1980-01-01
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(plain.length, 22);
    head.writeUInt16LE(nameBytes.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, nameBytes, packed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // made by
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(plain.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt32LE(name.endsWith("/") ? 0x10 : 0, 38); // MS-DOS folder flag
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBytes);

    offset += head.length + nameBytes.length + packed.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
