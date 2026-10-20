# Fonts

All three families are licensed under the SIL Open Font License 1.1 and are self-hosted
here (latin subset, copied from the Fontsource npm packages) so builds do not depend on
Google Fonts being reachable.

- Playfair Display (variable) — wordmark, headings
- Montserrat (variable) — body and interface
- Cormorant Infant — tagline and short accents

https://openfontlicense.org

`og/` holds static (non-variable) `.woff` files of Playfair Display and Montserrat from the
same Fontsource packages, for the generated share images: the image renderer reads neither
`woff2` nor variable fonts.
- `playfair-display-latin-ext-400-normal.woff` is there only for the rupee sign (₹).
