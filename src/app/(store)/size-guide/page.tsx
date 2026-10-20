import type { Metadata } from "next";
import { TextPage } from "@/components/storefront/text-page";

export const metadata: Metadata = {
  title: "Size guide",
  description: "How to measure yourself, and how to read the garment measurements on every Astitva piece.",
  alternates: { canonical: "/size-guide" },
};

export default function SizeGuidePage() {
  return (
    <TextPage
      title="Size guide"
      intro={<p>Sizes vary between labels, so every product page lists the measurements of that exact garment.</p>}
    >
      <h2>Measure yourself</h2>
      <ul>
        <li>Bust: around the fullest part of your chest, tape level under the arms.</li>
        <li>Waist: around your natural waist, the narrowest part of your torso.</li>
        <li>Hip: around the fullest part of your hips, feet together.</li>
        <li>Length: from the highest point of the shoulder down to where you want the hem.</li>
      </ul>
      <h2>Compare with the garment</h2>
      <p>
        Garment measurements are taken with the piece laid flat and doubled for circumference. For a comfortable fit,
        choose a garment a few centimetres larger than your body measurement at the bust and hip.
      </p>
      <p>Not sure? Message us with your measurements and we will tell you how the piece fits.</p>
    </TextPage>
  );
}
