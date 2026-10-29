# Storefront design: the Lookbook

Astitva is a fashion label whose store opens like a printed lookbook: a cover, a note from Krishna and a contents page, each style numbered and named. Then it turns into the shop: every piece at once, in the colours and sizes the house has, then the categories.

## The ideas the design carries

| Idea | Where it shows | Data |
| --- | --- | --- |
| Every style is numbered and named | Plates, captions, piece page, WhatsApp message | `products.piece_number` (unique, never reused), `products.piece_name`; `products.name` stays the plain description |
| Every piece has a provenance | Caption under each plate (first sentence), piece page | `products.story` |
| The lookbook opens with a note | Home cover and note page | `store_settings`: lookbook title, subtitle, note, note signature (edited at `/admin/settings`) |
| Colours as the brand offers them | Swatches on lookbook pages, the shop and the piece page; sold-out colours struck through | `product_variants.color`, `color_hex`; photos per colour in `product_images.color` |
| A person, not a bot | "Ask Krishna about the fit" on each piece, concierge band | `store_settings.support_whatsapp`, `store_settings.concierge_name` |
| How she would wear it | Quote on the piece page, signed | `products.styling_note`, `store_settings.note_signature` |

## Signature devices

- **The arch.** Every image and every cover sits in an arched window. Nothing else uses it.
- **The painted sketch.** Until a piece is photographed, its arch holds an ink-and-watercolour sketch of its kind of garment (dress, co-ord set, top, outerwear, from its category) on a hanger, washed in the piece's own colour (`products.tone`). The ink draws itself as the plate scrolls in on wide screens; on phones and with reduced motion the finished sketch shows. Code: `components/lookbook/sketch-plate.tsx`, used by `Plate` whenever there is no photo. With a photograph, the tone shows while the image loads.
- **The Astitva woman (mascot).** The woman in the wide-brimmed hat from the logo. She stands in the lookbook cover's arch until there is a campaign photograph, and she draws herself in the first-visit intro.

## The first-visit intro

On a visitor's first visit to any storefront page (including straight from Instagram), the mascot is sketched in fine sepia lines, then the painting arrives: the hat settles onto her head and a glint runs along the brim, her face and earring appear (the earring swings once), and her hair washes in from under the brim. Then she lifts away and the page shows; on the homepage the cover arch fades in with her already inside it. Nothing on the site rises into place: on a phone that reads as the page loading from the bottom up, so things fade in where they stand.

- About 2.2 seconds from first paint. Any tap, click, scroll or key skips it.
- Plays once per browser (`localStorage["astitva:intro"]`). Add `?intro` to any URL to replay it for review.
- Never on `/admin`, `/checkout` or `/api`. Never without JavaScript. If storage is blocked it does not play.
- The page renders underneath at the same time. The painted layers (about 35 KB) load only when the intro plays.
- Reduced motion: no drawing or movement; the finished painting shows for a moment, then the page.
- A CSS failsafe removes the overlay after 7 seconds whatever happens.

Code: `components/brand/intro.tsx` (markup and the two inline scripts), the "First-visit intro" block in `globals.css`.

## Mascot assets

All mascot artwork is generated from the logo by `python3 scripts/mascot/build.py`: the painting cut into transparent layers (`public/intro/*.webp`), the cover image (`public/brand/mascot.webp`), the browser and search icons (`src/app/icon.png`, `apple-icon.png`, `favicon.ico`: the whole mascot in the logo's ring; `--icons` rebuilds only these, from `public/brand/mascot.webp`) and `components/brand/mascot-data.ts` (layer positions and sketch strokes). The sketch strokes are hand-placed in `scripts/mascot/sketch.py`.

The logo was generated with ChatGPT and exists only as a 1067 px raster. Before print (cards, packaging), have a designer redraw it as layered vector art; then replace this pipeline with their files and keep `mascot-data.ts`'s shape.

## Choosing a colour

The signature interaction. Wherever a style shows its swatches (its lookbook page, the shop card, the piece page), choosing a colour repaints the plate: the sketch's watercolour eases to the new colour, or that colour's photograph crossfades in over the last one (`components/brand/fading-photo.tsx`): the old photo stays until the new one has loaded, so the arch never shows its bare colour. Every colour's main photo is fetched in the background once the piece page is idle, and a shop card's as soon as a pointer or finger reaches its swatch, so most changes are instant. The choice travels with the shopper (`?colour=Sage` on the piece page, kept in the address without a reload, so a shared link opens on it).

- **Swatches** (`components/storefront/swatch-picker.tsx`): real radio buttons (arrow keys, screen-reader names); a ring grows round the chosen one; sold-out colours are struck through but still choosable, to see them.
- **Piece page photos** (`components/storefront/piece-gallery.tsx`, `photo-viewer.tsx`): the chosen colour's photos in a row to swipe through (on phones the next one peeks in), with thumbnails and a "2 / 5" count beneath and arrows on wide screens. Tapping one opens it full screen on the colour's own ground: swipe or arrow between them, tap to zoom in where you tapped and drag round, tap again to zoom out. The gallery's own copy shows at once and a sharp one fades in over it. "See it from every side" (or the 360° video) swaps the row for the turning view.
- **Piece page details:** a breadcrumb (Shop / category / piece), then number, name, price and story, the choice and the button, and four facts from the store settings and policies (when it leaves us, what delivery costs, how to pay, the return window). Below, folded sections that open smoothly: About this piece, Size & fit (the measurements), Fabric & care, Delivery & returns. The numbers come from `POLICY_TERMS` in `content/policies.ts`, so the page and the policies never disagree.
- **Piece page choice:** colour, then only the sizes that colour is made in (sold-out sizes struck through), a stock line ("In stock, ready to send" or sold out, never how few are left), the size guide in a slide-over sheet, and on phones a bar with the choice and the button once the main button scrolls away. The WhatsApp link names the chosen colour and size.
- **Shop:** pointing at a swatch previews that colour on the card; choosing it opens the piece in it.
- **Loading:** skeletons shaped like each page (arches, swatch dots, size chips) with a slow sheen; none of the sheen under reduced motion.

## The bag and checkout

- **Adding:** a dot of the chosen colour arcs from the button to "Bag" in the masthead, the count bounces, then the bag slides open. With reduced motion the count simply changes. When every unit of that colour and size is already in the bag, the button reads "In your bag".
- **The bag** (`components/storefront/bag`): the same side sheet as the size guide (a bottom sheet on phones). Each line is the piece's plate washed in its colour, its number and name, colour · size, a − n + stepper capped at what's in stock, and Remove. A line that sold out since is marked in burgundy and checkout waits until it's changed.
- **Checkout:** one page, three numbered steps set like the lookbook's folios (You, Where it goes, How you'll pay), the bag beside it (folded into a "Show your bag" line on phones). Quiet fields on paper; on a failed submit the first field to fix takes focus. The button carries the total ("Place order · ₹3,499").
- **The order page:** an olive tick that draws itself, "Thank you, Asha.", what happens next in a sentence, and a WhatsApp button that opens with the order number already typed.

## Motion

One moment per page, never decoration (the first-visit intro aside):

- the cover arch rises open on first load while the title settles;
- opening a piece morphs its plate into the piece page hero (React `ViewTransition`, shared name `piece-<slug>`).

- turning the pages of the lookbook (sticky leaves, wide screens);
- a sketch's ink drawing itself as its plate comes into view (wide screens).

All are disabled under `prefers-reduced-motion`. A transition name must appear once per page, so a style appears once on any page.

## Layout

- **The lookbook** (`components/lookbook/lookbook.tsx`): the home page opens as a printed lookbook. A cover spread (the lookbook title set huge; short titles run across the fold and over the arch, long ones wrap; the opening line of Krishna's note, signed), the whole note as its own page, and a contents page of three pieces (numbers, names, colours, dotted leaders, prices; each row opens its piece, and "See all N styles" goes to the shop below). Krishna chooses the three in the admin (Lookbook & settings → The Contents page), in order; a place left on Random, or whose piece is no longer published, gets a piece drawn at random each time the cached home page is rebuilt (`modules/catalog/contents.ts`). Pages carry print furniture: running heads, folios (roman for front matter), a gutter shadow on spreads, paper grain. On wide screens each page sticks and the next slides over it like a turned leaf; on phones pages simply follow one another.
- **The shop on the home page** (`components/lookbook/home-sections.tsx`): after the contents, "The pieces" (every piece as a shop card: swatches, price, save) slides over the last leaf, then "Categories" (a sketched arch per category, its number of styles or "Coming soon", each opening `/shop/<category>`). Both scroll normally.
- **Grid** (`/shop`): every piece at once for people who know what they want; middle column stepped down.
- **Masthead**: wordmark centred with the tagline beneath, navigation split either side; a no-JavaScript disclosure on phones.

## Type

- Playfair Display: wordmark, titles, piece names (italic), numbers, letters.
- Cormorant Infant italic: captions and provenance (`.caption`), signatures.
- Montserrat: interface, prices, details. Sentence case, no tracked capitals except the wordmark.

Scale is 1.25 from a 16px body, extended to 7.45rem for covers (see `globals.css`).

## Tokens (the brand colours, confirmed 2026-10-21)

| Token | Hex | Use | Contrast on ivory |
| --- | --- | --- | --- |
| ivory | `#f7f1e7` | Page ground | n/a |
| champagne | `#efe3cc` | Concierge band, raised surfaces | n/a |
| sand | `#e3d2b9` | Image frames | n/a |
| taupe | `#a39282` | Rules and borders only | 2.67, never text |
| olive | `#56573a` | Availability, "One of one" | 6.63, AA |
| burgundy | `#6a1d2b` | Buttons, drop cap, focus ring | 10.25, AA |
| espresso | `#34251e` | Text | 13.08, AAA |
| espresso-soft | `#66554a` | Secondary text | 6.31, AA |
| gold | `#a9864e` | Ornaments only | 3.01, never text |

Text on a plate switches between ivory and espresso by the tone's luminance (`lib/tone.ts`).

## Usability rules that stay

- On a phone, the piece's name shows without scrolling and the price and buy button stay fixed at the bottom.
- "Inclusive of all taxes" under every price.
- Garment measurements in centimetres on every piece, linked to the size guide.
- Sold-out colours and sizes can't be added to the bag; they say "Sold out".
- Visible focus ring, skip link, reduced motion respected.

## Copy that needs Krishna

Everything in her voice is a draft: the lookbook note, each story and styling note (sample data), and any promise in `src/content/brand.ts` (e.g. "Packed by hand"), which is hidden in production until marked `confirmed`.
