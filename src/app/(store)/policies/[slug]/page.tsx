import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPolicy, POLICY_PAGES } from "@/content/policies";

export function generateStaticParams() {
  return POLICY_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const policy = getPolicy((await params).slug);
  if (!policy) return { title: "Not found", robots: { index: false } };
  return {
    title: policy.title,
    description: policy.summary,
    alternates: { canonical: `/policies/${policy.slug}` },
    // A draft isn't a promise yet: keep it out of search until Krishna confirms it.
    ...(policy.status === "draft" ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function PolicyPage({ params }: PageProps<"/policies/[slug]">) {
  const policy = getPolicy((await params).slug);
  if (!policy) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-8">
      <div className="prose-astitva">
        <h1 className="text-4xl">{policy.title}</h1>
        {policy.status === "draft" && (
          <p className="mt-6 border-l-2 border-gold bg-champagne/60 px-4 py-3 text-sm">
            This policy is being finalised and may change before the store opens.
          </p>
        )}
        <div className="mt-8">
          {policy.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
