import { formatPieceNumber } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { brandCard, pieceCard } from "@/lib/og";
import { compareSizes } from "@/lib/sizes";
import { getProductBySlug, getStorefront, listPieces } from "@/modules/catalog/queries";

export async function generateStaticParams() {
  return (await listPieces({ limit: 500 })).map((p) => ({ slug: p.slug }));
}

/**
 * The card shown when a piece's link is shared: its photo or colour, name,
 * colours and price. A plain route at a stable address (/pieces/<slug>/share.png),
 * because Next's opengraph-image convention adds a build hash to the address,
 * and the sitemap and product data need one that doesn't change.
 */
export async function GET(_request: Request, { params }: RouteContext<"/pieces/[slug]/share.png">) {
  const product = await getProductBySlug((await params).slug);
  if (!product || product.variants.length === 0) {
    const store = await getStorefront();
    return brandCard({ title: store.title, subtitle: store.subtitle, tones: [] });
  }
  const colours: { name: string | null; hex: string | null }[] = [];
  for (const v of product.variants) if (!colours.some((c) => c.name === v.color)) colours.push({ name: v.color, hex: v.colorHex });
  const sizes = [...new Set(product.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))].sort(compareSizes);
  const lowest = Math.min(...product.variants.map((v) => v.priceMinor));
  const several = new Set(product.variants.map((v) => v.priceMinor)).size > 1;
  return pieceCard({
    pieceNumber: product.pieceNumber ? formatPieceNumber(product.pieceNumber) : null,
    title: product.pieceName ?? product.name,
    name: product.pieceName ? product.name : "",
    price: `${several ? "From " : ""}${formatINR(lowest)}`,
    colours,
    sizes,
    photo: product.images[0]?.url ?? null,
  });
}
