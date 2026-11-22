/**
 * Photo folders: one per piece, named by its number ("13 The Muse Knit"),
 * with one folder inside per colour ("Sage"). Photos straight in a piece's
 * folder are for every colour. Only the number has to stay as it is: the
 * rest of a folder's name can be anything.
 */

/** A name any computer accepts for a folder. */
export function folderName(number: number | null, title: string): string {
  const clean = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 80);
  return number ? `${number} ${clean}`.trim() : clean || "Untitled";
}

/** 13 for "13 The Muse Knit", "Nº 13 – The Muse Knit" or "13"; null for "Sage". */
export function numberOfFolder(name: string): number | null {
  const m = /^\s*(?:n[º°o.]*\s*)?(\d{1,4})(?=$|[\s._–—-])/i.exec(name);
  return m ? Number(m[1]) : null;
}

const PHOTO = /\.(jpe?g|png|webp|avif|heic|heif)$/i;

export type FolderPhoto = { file: File; piece: number; colour: string | null };

/**
 * Where each chosen photo goes, from its path inside the chosen folder: the
 * nearest folder named with a number is the piece, and the folder below it,
 * if any, the colour. Files that aren't photos, or that sit outside any
 * piece's folder, are returned apart.
 */
export function placePhotos(files: { file: File; path: string }[]): { placed: FolderPhoto[]; stray: string[] } {
  const placed: FolderPhoto[] = [];
  const stray: string[] = [];
  for (const { file, path } of files) {
    const parts = path.split("/").filter(Boolean);
    const name = parts.pop() ?? "";
    if (name.startsWith(".")) continue; // .DS_Store and the like
    if (!PHOTO.test(name)) {
      stray.push(path);
      continue;
    }
    const at = parts.findLastIndex((p) => numberOfFolder(p) !== null);
    if (at < 0) {
      stray.push(path);
      continue;
    }
    placed.push({ file, piece: numberOfFolder(parts[at])!, colour: parts[at + 1] ?? null });
  }
  // Each folder's photos in name order (IMG_2 before IMG_10), so the first is the main photo.
  placed.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
  return { placed, stray };
}
