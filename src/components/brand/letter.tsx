import Link from "next/link";
import { paragraphs } from "@/lib/format";

/**
 * Krishna's note, set like a printed letter. `excerpt` shows the first
 * paragraphs with a link to the rest.
 */
export function Letter({
  text,
  signature,
  excerpt,
  href,
  id = "letter",
}: {
  text: string;
  signature: string | null;
  excerpt?: number;
  href?: string;
  id?: string;
}) {
  const all = paragraphs(text);
  if (all.length === 0) return null;
  const shown = excerpt ? all.slice(0, excerpt) : all;
  const truncated = shown.length < all.length;

  return (
    <section id={id} aria-label="A letter" className="mx-auto grid max-w-6xl scroll-mt-24 gap-8 px-4 sm:px-8 md:grid-cols-12">
      <div className="md:col-span-3 md:col-start-2">
        <p className="caption text-xl">A letter{signature ? ` from ${signature}` : ""}</p>
      </div>
      <div className="md:col-span-7">
        <div className="letter max-w-[36rem]">
          {shown.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {signature ? <p className="mt-8 font-accent text-3xl italic">{signature}</p> : null}
        {truncated && href ? (
          <Link href={href} className="link mt-8 inline-block text-sm">
            Read the whole letter
          </Link>
        ) : null}
      </div>
    </section>
  );
}
