# Storefront design: the Lookbook

Astitva is presented as a house that releases **chapters** of hand-chosen pieces, not as a shop with stock. The site reads like a printed lookbook: a cover, a letter, then the pieces as plates, each numbered and named.

## The ideas the design carries

| Idea | Where it shows | Data |
| --- | --- | --- |
| Every piece is numbered and named | Plates, captions, piece page, archive, WhatsApp message | `products.piece_number` (unique, never reused), `products.piece_name`; `products.name` stays the plain description |
| Every piece has a provenance | Caption under each plate (first sentence), piece page | `products.story` |
| Releases are chapters with a letter | Homepage cover and letter, `/chapters/[slug]` | `chapters` table: number (shown in Roman), title, subtitle, letter, signature, release date, cover, tone |
| Sold pieces stay visible | "Found their home" on the homepage, `/archive` | Derived: active product, nothing left on hand, at least one sale. City shown only if the buyer opted in (`orders.share_city_in_archive`) |
| A person, not a bot | "Ask Krishna about the fit" on each piece, concierge band | `store_settings.support_whatsapp`, `store_settings.concierge_name` |
| How she would wear it | Quote on the piece page, signed | `products.styling_note`, chapter `letter_signature` |

## Signature devices

- **The arch.** Every image and every cover sits in an arched window. Nothing else uses it.
- **The plate placeholder.** Until a piece is photographed, its arch is filled with the piece's own colour (`products.tone`) under soft window light and a fine grain, with its number and name set in it. With a photograph, the same tone shows while the image loads.
- **The hat mark.** A single-line wide-brimmed hat (placeholder for the illustrator's woman in the hat) used as an ornament: cover, letter, styling note, footer, archive. Gold, never text.

## Motion

One moment per page, never decoration:

- the cover arch rises open on first load while the title settles;
- opening a piece morphs its plate into the piece page hero (React `ViewTransition`, shared name `piece-<slug>`).

Both are disabled under `prefers-reduced-motion`. A transition name must appear once per page: the homepage shows available pieces in the spreads and sold ones only in the archive section.

## Layout

- **Spreads** (`components/brand/spreads.tsx`): a rhythm of one plate with its caption beside it, then a pair with the second set lower, then a mirrored single. On phones, one piece per screen.
- **Grid** (`/shop`): every piece at once for people who know what they want; middle column stepped down.
- **Masthead**: wordmark centred with the tagline beneath, navigation split either side; a no-JavaScript disclosure on phones.

## Type

- Playfair Display: wordmark, titles, piece names (italic), numbers, letters.
- Cormorant Infant italic: captions and provenance (`.caption`), signatures.
- Montserrat: interface, prices, details. Sentence case, no tracked capitals except the wordmark.

Scale is 1.25 from a 16px body, extended to 7.45rem for covers (see `globals.css`).

## Tokens (placeholders until the final logo files arrive)

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
- Sold pieces can't be added to the bag; they say "Found its home".
- Visible focus ring, skip link, reduced motion respected.

## Copy that needs Krishna

Everything in her voice is a draft: the chapter letter, each story and styling note (sample data), and any promise in `src/content/brand.ts` (e.g. "Packed by hand"), which is hidden in production until marked `confirmed`.
