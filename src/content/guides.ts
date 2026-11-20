/**
 * Styling guides: answers to what people search before they buy ("how to
 * style a co-ord set"), each pointing to the pieces it talks about. Styling
 * advice and what the photos show only: no claims about fabric, care or
 * fit that a piece's own page doesn't make.
 *
 * `pieces` are slugs; a piece that is unpublished or renamed is skipped.
 */
export type Guide = {
  slug: string;
  title: string;
  /** For search results and the guides list. Under 160 characters. */
  description: string;
  published: string;
  intro: string;
  sections: { heading: string; paragraphs: string[]; pieces?: string[] }[];
};

export const GUIDES: Guide[] = [
  {
    slug: "how-to-style-a-co-ord-set",
    title: "How to style a co-ord set, as a set and apart",
    description: "Ways to wear a women's co-ord set in winter and beyond: as a set, split up with what you own, and layered for the cold.",
    published: "2026-11-20",
    intro:
      "A co-ord set is a top and trousers made to be worn together. That is the whole appeal: one decision, and you're dressed. But a good set is really three pieces of clothing, the set and each half on its own. Here is how to get all three out of it.",
    sections: [
      {
        heading: "Wear it as a set",
        paragraphs: [
          "Matching top and bottom read as one long line, which is why a set looks put-together with no effort at all. Keep everything else quiet: plain shoes, a simple bag, little jewellery. Let the set be the outfit.",
          "Tonal dressing works especially well in winter. A knit set in one soft colour, white, beige, grey or brown, looks calm and expensive, and every accessory you own goes with it.",
        ],
        pieces: ["the-winter-muse", "the-sunday-edit"],
      },
      {
        heading: "Split it up",
        paragraphs: [
          "Wear the top with your own jeans or a skirt, and the trousers with a simple fitted top. Half a set is easiest when the other half is plainer than it: a solid colour, no print, a close fit.",
          "A zip-up knit jacket from a set doubles as everyday outerwear over any top. Wide-leg trousers from a set pair with a fitted long-sleeve top for a cleaner look than the full set.",
        ],
        pieces: ["the-muse-top", "the-everyday-muse"],
      },
      {
        heading: "Layer it for the cold",
        paragraphs: [
          "A half-sleeve shirt set doesn't have to wait for summer. Put a fitted long-sleeve top underneath and a jacket over it, and wear the trousers as they are.",
          "With a knit set, layer from the inside: a thin fitted top under the jacket, zipped up on cold days and open when the sun comes out.",
        ],
        pieces: ["the-cloudline-jacket"],
      },
    ],
  },
  {
    slug: "how-to-wear-sweaters-in-winter",
    title: "Five ways to wear a sweater this winter",
    description: "Styling ideas for women's winter sweaters: ribbed knits, cropped crochet, embroidered and off-shoulder styles, and what to wear them with.",
    published: "2026-11-20",
    intro:
      "A sweater is the easiest thing to reach for on a cold morning, and the easiest to wear the same way every day. Here are five ways to wear the knits in the shop, and what each one pairs with.",
    sections: [
      {
        heading: "1. The fitted ribbed V-neck",
        paragraphs: [
          "A close-fitting ribbed knit with a V-neck is the most useful sweater there is. Tuck it into high-waisted trousers for work, or wear it loose over jeans at the weekend. In a strong colour like deep cherry red it is the whole outfit; in cream or black it goes under everything.",
        ],
        pieces: ["the-muse-knit"],
      },
      {
        heading: "2. The cropped crochet sweater",
        paragraphs: [
          "An open crochet knit, cropped short with wide sleeves, needs something high-waisted underneath: wide-leg trousers or a long skirt that meets the hem. Wear a fitted top or camisole under it to change how much of the stitch shows.",
        ],
        pieces: ["the-crochet-sweater-women-s-crochet-knit-winter-sweater"],
      },
      {
        heading: "3. The statement embroidery",
        paragraphs: [
          "When the sweater has embroidery on the front and sleeves, let it do the talking. Plain dark trousers or jeans, no other pattern, simple shoes.",
        ],
        pieces: ["the-midnight-garden"],
      },
      {
        heading: "4. The off-shoulder knit",
        paragraphs: [
          "A fuzzy knit with a square neck and straps over the shoulders is a sweater for going out. Keep the neck bare to show the straps, and pair it with fitted dark trousers or a skirt.",
        ],
        pieces: ["the-blush-whisper"],
      },
      {
        heading: "5. The easy weekend layer",
        paragraphs: [
          "A half-zip jumper or a cropped collared sweatshirt is for the days you want comfort first. Wear the half-zip with joggers or jeans, zipped up or open at the collar; the cropped sweatshirt with high-waisted jeans.",
        ],
        pieces: ["the-cloud-comfort", "the-little-dreamer"],
      },
    ],
  },
];

export function guideBySlug(slug: string) {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}
