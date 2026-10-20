import { useId } from "react";
import { luminance, normaliseTone } from "@/lib/tone";

/**
 * A painted fashion sketch that stands in for a photograph: the garment on a
 * hanger in ink, washed in the piece's own colour. Drawn by hand-tuned paths
 * per kind of garment, with SVG filters for the wobble of a pen and the
 * bleeding edge of watercolour. The ink draws itself as the plate scrolls
 * into view (see .sketch in globals.css), echoing the first-visit intro.
 */

export type GarmentKind = "dress" | "co-ord" | "top" | "outerwear";

export function garmentKind(categorySlug: string | null | undefined): GarmentKind {
  switch (categorySlug) {
    case "co-ords":
      return "co-ord";
    case "tops":
      return "top";
    case "outerwear":
      return "outerwear";
    default:
      return "dress";
  }
}

const HANGER = "M200 38 c0 -11 13 -13 13 -2 c0 6 -6 9 -13 15 L122 92 Q116 97 124 97 L276 97 Q284 97 278 92 L200 51";

/** `frame` is the drawing's own viewBox, so shorter garments are drawn larger rather than floating high. */
type Drawing = { body: string; details: string[]; frame: string };

const DRAWINGS: Record<GarmentKind, Drawing> = {
  dress: {
    frame: "20 20 360 470",
    body: "M150 97 L178 101 L200 152 L222 101 L250 97 C252 118 258 136 264 150 C256 176 246 198 240 216 C262 290 286 372 302 448 Q200 472 98 448 C114 372 138 290 160 216 C154 198 144 176 136 150 C142 136 148 118 150 97 Z",
    details: [
      "M160 216 Q200 228 240 216",
      "M234 221 q10 30 -2 62",
      "M238 220 q18 24 16 52",
      "M180 242 Q170 340 154 440",
      "M214 238 Q224 340 240 446",
      "M197 240 Q199 350 201 456",
    ],
  },
  "co-ord": {
    frame: "20 20 360 470",
    body: "M146 97 L184 99 L200 120 L216 99 L254 97 L300 121 L318 197 L290 205 L282 171 L282 270 L118 270 L118 171 L110 205 L82 197 L100 121 Z M130 282 L270 282 L277 302 L292 462 L222 464 L202 322 L198 322 L178 464 L108 462 L123 302 Z",
    details: [
      "M184 99 L192 128 L200 120 L208 128 L216 99",
      "M200 128 L200 270",
      "M151 302 L144 456",
      "M249 302 L256 456",
      "M130 292 L270 292",
    ],
  },
  top: {
    frame: "40 22 320 360",
    body: "M148 97 L182 101 Q200 130 218 101 L252 97 L296 129 L320 237 L292 243 L276 177 L278 332 Q200 346 122 332 L124 177 L108 243 L80 237 L104 129 Z",
    details: ["M200 120 L200 166", "M126 300 L124 332", "M274 300 L276 332", "M160 190 Q164 260 158 322", "M240 190 Q236 260 242 322"],
  },
  outerwear: {
    frame: "36 22 328 390",
    body: "M144 97 L178 101 L200 232 L222 101 L256 97 L298 119 L318 302 L290 306 L280 191 L284 362 L206 370 L200 242 L194 370 L116 362 L120 191 L110 306 L82 302 L102 119 Z",
    details: [
      "M178 101 L168 152 L200 232",
      "M222 101 L232 152 L200 232",
      "M168 152 L184 160",
      "M232 152 L216 160",
      "M132 302 L172 302",
      "M228 302 L268 302",
    ],
  },
};

/**
 * Watercolour never sits at either extreme: very pale tones (ivory) would
 * vanish on paper, so they take a touch of espresso; very dark ones (kahwa,
 * jamun) would read as solid paint, so they are thinned towards the paper.
 */
export function washColour(tone: string): string {
  const l = luminance(tone);
  const toward = l > 0.6 ? [0x34, 0x25, 0x1e] : l < 0.06 ? [0xf7, 0xf1, 0xe7] : null;
  if (!toward) return tone;
  const amount = l > 0.6 ? 0.28 : 0.3;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(tone.slice(i, i + 2), 16));
  return `#${[r!, g!, b!].map((c, k) => Math.round(c * (1 - amount) + toward[k]! * amount).toString(16).padStart(2, "0")).join("")}`;
}

export function SketchPlate({
  kind,
  tone,
  label,
  seed = 1,
}: {
  kind: GarmentKind;
  tone: string | null;
  /** Read out instead of the drawing, e.g. "Sketch of Nº 01 Neem, olive linen wrap dress". */
  label: string;
  /** Varies the watercolour so neighbouring sketches don't look stamped. */
  seed?: number;
}) {
  const id = useId().replace(/:/g, "");
  const colour = washColour(normaliseTone(tone));
  const { body, details, frame } = DRAWINGS[kind];

  return (
    <svg viewBox={frame} role="img" aria-label={label} className="sketch h-full w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        {/* Watercolour. The shape's edge wanders; pigment settles unevenly
            (noise as opacity); and it pools darker at the rim as it dries. */}
        <filter id={`wash-${id}`} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="3" seed={seed} result="drift" />
          <feDisplacementMap in="SourceGraphic" in2="drift" scale="30" xChannelSelector="R" yChannelSelector="G" result="shape" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" seed={seed + 11} result="density" />
          <feColorMatrix in="density" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0 0 0 0.12" result="settle" />
          <feComposite in="shape" in2="settle" operator="in" result="body" />
          <feMorphology in="shape" operator="erode" radius="2.5" result="inner" />
          <feComposite in="shape" in2="inner" operator="out" result="rim" />
          <feGaussianBlur in="rim" stdDeviation="0.9" result="pooled" />
          <feMerge>
            <feMergeNode in="body" />
            <feMergeNode in="pooled" />
          </feMerge>
        </filter>
        {/* Ink: a pen line wavers. */}
        <filter id={`ink-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed={seed + 3} result="tremor" />
          <feDisplacementMap in="SourceGraphic" in2="tremor" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      {/* The wash is laid loosely: a little off the line, not quite filling it. */}
      <g className="sketch-wash" opacity="0.88">
        <path
          d={body}
          fill={colour}
          fillRule="evenodd"
          filter={`url(#wash-${id})`}
          transform="translate(5 4) scale(0.98)"
          style={{ transformOrigin: "200px 280px" }}
        />
      </g>

      <g className="sketch-ink" filter={`url(#ink-${id})`} fill="none" stroke="var(--color-espresso)" strokeLinecap="round" strokeLinejoin="round">
        <path d={HANGER} pathLength={1} strokeWidth="1.8" />
        <path d={body} pathLength={1} strokeWidth="1.6" />
        {/* A second, lighter pass, as a hand redraws an outline. */}
        <path d={body} pathLength={1} strokeWidth="0.8" opacity="0.4" transform="translate(1.6 -1.2)" />
        {details.map((d) => (
          <path key={d} d={d} pathLength={1} strokeWidth="1" opacity="0.6" />
        ))}
      </g>
    </svg>
  );
}
