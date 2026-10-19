# Storefront design notes

## Direction

Sophisticated, feminine, editorial (from Krishna's identity board). One signature device carries the brand: the **arch**, a boutique doorway or the curve of a hat brim. Every product and campaign image sits in an arch. Everything else stays quiet: no cards, no shadows, no gradients, burgundy used only for actions.

## Tokens (placeholders until the final logo files arrive)

| Token | Hex | Use | Contrast on ivory |
| --- | --- | --- | --- |
| ivory | `#f7f1e7` | Page ground | n/a |
| champagne | `#efe3cc` | Raised surfaces, footer | n/a |
| sand | `#e3d2b9` | Image frames | n/a |
| taupe | `#a39282` | Rules and borders only | 2.67, never text |
| olive | `#56573a` | Availability, "One of one" | 6.63, AA |
| burgundy | `#6a1d2b` | Buttons, active states, focus ring | 10.25, AA |
| espresso | `#34251e` | Text | 13.08, AAA |
| espresso-soft | `#66554a` | Secondary text | 6.31, AA |
| gold | `#a9864e` | Monogram and ornaments only | 3.01, never text |

When the real values arrive, update `src/app/globals.css` and re-check every pair that carries text.

## Type

- Playfair Display: wordmark, headings, product names.
- Montserrat: body, prices, interface. Sentence case, no tracked capitals.
- Cormorant Infant italic: the tagline and the "One of one" mark only.

Scale is 1.25 from a 16px body, defined in `globals.css`.

## Usability rules

- On a phone, name, price and the buy button are visible without scrolling the product page. The buy bar is fixed at the bottom on small screens.
- Prices always show "Inclusive of all taxes" on the product page.
- Sold pieces stay listed with a "Sold" label; they cannot be added to the bag.
- Garment measurements in centimetres on every product, with a link to the size guide.
- Visible focus ring, skip link, reduced motion respected.
