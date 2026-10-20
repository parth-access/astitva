import type { Metadata } from "next";
import { TextPage } from "@/components/storefront/text-page";

export const metadata: Metadata = { title: "About", description: "The story behind Astitva." };

// TODO(brand): replace with Krishna's own story before launch.
export default function AboutPage() {
  return (
    <TextPage title="About Astitva" intro={<p className="font-accent text-2xl italic">Your true form</p>}>
      <p>
        Astitva is a Sanskrit word for existence: the simple fact of being yourself. The brand began with a small
        collection of pieces chosen by hand, each one picked because it felt like someone, not like everyone.
      </p>
      <p>
        We would rather offer a few styles, in the colours we couldn&apos;t choose between, than a rail of everything.
        In time, Astitva will also make clothing of its own.
      </p>
    </TextPage>
  );
}
