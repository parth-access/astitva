import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPolicy, POLICY_PAGES, type PolicyBlock } from "@/content/policies";
import { whatsappLink } from "@/lib/format";
import { ACROSS } from "@/lib/transition-types";
import { getConcierge } from "@/modules/catalog/queries";

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

function Blocks({ blocks }: { blocks: PolicyBlock[] }) {
  return blocks.map((b, i) =>
    typeof b === "string" ? (
      <p key={i}>{b}</p>
    ) : (
      <ul key={i}>
        {b.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ),
  );
}

export default async function PolicyPage({ params }: PageProps<"/policies/[slug]">) {
  const policy = getPolicy((await params).slug);
  if (!policy) notFound();
  // The grievance contact the e-commerce rules ask for, from the admin's settings.
  const contact = await getConcierge();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-8">
      <div className="prose-astitva">
        <h1 className="text-4xl">{policy.title}</h1>
        {policy.status === "draft" && (
          <p className="mt-6 border-l-2 border-gold bg-champagne/60 px-4 py-3 text-sm">
            This policy is being finalised and may change. If anything here matters for your order, message us before you buy.
          </p>
        )}
        <div className="mt-8">
          <Blocks blocks={policy.intro} />
          {policy.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              <Blocks blocks={s.body} />
            </section>
          ))}
          <section>
            <h2>Questions and complaints</h2>
            <p>
              Write to {contact.name ?? "us"}
              {contact.name ? ", who looks after orders and complaints" : ""}. We reply to every message, usually within a working day, and resolve
              complaints within a month at most.
            </p>
            <ul>
              {contact.email ? (
                <li>
                  Email:{" "}
                  <a href={`mailto:${contact.email}`} className="link">
                    {contact.email}
                  </a>
                </li>
              ) : null}
              {contact.whatsapp ? (
                <li>
                  WhatsApp:{" "}
                  <a href={whatsappLink(contact.whatsapp, "Hello Astitva, ")} target="_blank" rel="noopener noreferrer" className="link">
                    message us
                  </a>
                </li>
              ) : null}
              <li>
                Or see{" "}
                <Link href="/contact" transitionTypes={ACROSS} className="link">
                  Contact
                </Link>
                .
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
