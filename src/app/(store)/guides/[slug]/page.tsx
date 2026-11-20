import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/brand/json-ld";
import { ProductGrid } from "@/components/storefront/product-grid";
import { GUIDES, guideBySlug } from "@/content/guides";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { articleLd, breadcrumbLd, pageMeta } from "@/lib/seo";
import { ACROSS } from "@/lib/transition-types";
import { listPieces } from "@/modules/catalog/queries";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return { title: "Not found", robots: { index: false } };
  return pageMeta({ title: guide.title, description: guide.description, path: `/guides/${guide.slug}` });
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  // The pieces each section talks about, as they are in the shop now. One no longer published is left out.
  const all = await listPieces({ limit: 500 });
  const piecesFor = (slugs: string[] = []) => slugs.flatMap((s) => all.filter((p) => p.slug === s));
  const first = piecesFor(guide.sections.flatMap((s) => s.pieces ?? [])).find((p) => p.imageUrl);
  const path = `/guides/${guide.slug}`;

  return (
    <article className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-8">
      <JsonLd
        data={[
          articleLd({ ...guide, path, image: first?.imageUrl ? cloudinaryUrl(first.imageUrl, { width: 1200 }) : null }),
          breadcrumbLd([
            { name: "Astitva", path: "/" },
            { name: "Styling guides", path: "/guides" },
            { name: guide.title, path },
          ]),
        ]}
      />
      <div className="prose-astitva">
        <p className="caption text-xl">
          <Link href="/guides" transitionTypes={ACROSS} className="link">
            Styling guides
          </Link>
        </p>
        <h1 className="mt-1 text-4xl">{guide.title}</h1>
        <p className="mt-6 text-lg text-espresso-soft">{guide.intro}</p>
      </div>
      {guide.sections.map((section) => {
        const pieces = piecesFor(section.pieces);
        return (
          <section key={section.heading} className="mt-16">
            <div className="prose-astitva">
              <h2 className="text-3xl">{section.heading}</h2>
              {section.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            {pieces.length ? (
              <div className="mt-8">
                <ProductGrid pieces={pieces} />
              </div>
            ) : null}
          </section>
        );
      })}
      <p className="mt-24">
        <Link href="/shop" transitionTypes={ACROSS} className="link">
          See everything in the shop
        </Link>
      </p>
    </article>
  );
}
