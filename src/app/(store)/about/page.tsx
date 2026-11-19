import type { Metadata } from "next";
import { TextPage } from "@/components/storefront/text-page";
import { paragraphs } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
import { getAbout, getConcierge } from "@/modules/catalog/queries";
import { profileLabel } from "@/lib/profiles";

export const metadata: Metadata = pageMeta({
  title: "About",
  description: "Astitva means existence: being yourself. A few women's styles chosen by hand, in the colours we couldn't choose between, sold online across India.",
  path: "/about",
});

export default async function AboutPage() {
  const [about, concierge] = await Promise.all([getAbout(), getConcierge()]);
  return (
    <TextPage title="About Astitva" intro={about.intro ? <p className="font-accent text-2xl italic">{about.intro}</p> : undefined}>
      {paragraphs(about.body).map((p) => (
        <p key={p}>{p}</p>
      ))}
      {concierge.profileLinks.length ? (
        <p>
          {concierge.profileLinks.map((href, i) => (
            <span key={href}>
              {i ? " · " : "Follow along on "}
              <a className="link" href={href} rel="me noopener" target="_blank">
                {profileLabel(href)}
              </a>
            </span>
          ))}
          .
        </p>
      ) : null}
    </TextPage>
  );
}
