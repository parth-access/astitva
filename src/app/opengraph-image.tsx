import { brandCard, OG_SIZE } from "@/lib/og";
import { getStorefront, listLookbookPieces } from "@/modules/catalog/queries";

export const alt = "Astitva: your true form";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The site's share card: the lookbook's title, in arches of the season's colours. */
export default async function Image() {
  const [store, pieces] = await Promise.all([getStorefront(), listLookbookPieces()]);
  const tones = pieces.flatMap((p) => p.colours.map((c) => c.hex)).filter((h): h is string => Boolean(h));
  // A spread of colours across styles, not four shades of the first one.
  const spread = [...new Set(tones)].filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 4)) === 0);
  return brandCard({ title: store.title, subtitle: store.subtitle, tones: spread });
}
