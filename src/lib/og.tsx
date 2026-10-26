/**
 * Share cards (1200×630): what WhatsApp, Instagram DMs, Facebook and search
 * show when someone shares a link. Drawn like the site: ivory paper, the arch,
 * Playfair italic, the colours as swatches.
 *
 * The renderer (Satori) reads only static ttf/otf/woff fonts, hence src/fonts/og,
 * and only flexbox layout. Photos are asked of Cloudinary as JPEG (no WebP here).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { isCloudinaryUrl, withTransformation } from "./cloudinary-url";
import { normaliseTone } from "./tone";

export const OG_SIZE = { width: 1200, height: 630 };

const IVORY = "#f7f1e7";
const ESPRESSO = "#34251e";
const SOFT = "#66554a";
const TAUPE = "#a39282";

const font = (file: string) => readFile(join(process.cwd(), "src/fonts/og", file));
// Read once per server instance; the files don't change.
const fontsReady = Promise.all([
  font("playfair-display-latin-400-normal.woff"),
  font("playfair-display-latin-400-italic.woff"),
  font("montserrat-latin-400-normal.woff"),
  font("montserrat-latin-500-normal.woff"),
  // Latin-extended holds the rupee sign (₹), which the plain Latin subset lacks.
  font("playfair-display-latin-ext-400-normal.woff"),
]);

async function render(node: React.ReactElement) {
  const [playfair, playfairItalic, montserrat, montserrat500, playfairExt] = await fontsReady;
  return new ImageResponse(node, {
    ...OG_SIZE,
    fonts: [
      { name: "Playfair", data: playfair, weight: 400, style: "normal" },
      { name: "Playfair", data: playfairItalic, weight: 400, style: "italic" },
      { name: "Montserrat", data: montserrat, weight: 400, style: "normal" },
      { name: "Montserrat", data: montserrat500, weight: 500, style: "normal" },
      { name: "Playfair Ext", data: playfairExt, weight: 400, style: "normal" },
    ],
  });
}

function photoJpeg(src: string, w: number, h: number): string | null {
  if (!isCloudinaryUrl(src)) return null;
  return withTransformation(src, `f_jpg,q_80,c_fill,g_auto,w_${w},h_${h}`);
}

function Wordmark({ size = 26 }: { size?: number }) {
  return <div style={{ fontFamily: "Playfair", fontSize: size, letterSpacing: size * 0.42, color: ESPRESSO }}>ASTITVA</div>;
}

/** The home page and anything without its own card. */
export async function brandCard(opts: { title: string | null; subtitle: string | null; tones: string[] }) {
  const tones = (opts.tones.length ? opts.tones : ["#8a8f6a", "#a5532f", "#2c3140"]).slice(0, 4).map((t) => normaliseTone(t));
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", background: IVORY, padding: "64px 72px" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
        <Wordmark size={30} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "Playfair", fontStyle: "italic", fontSize: opts.title && opts.title.length > 14 ? 84 : 110, lineHeight: 1.02, color: ESPRESSO, maxWidth: 620 }}>
            {opts.title ?? "Your true form"}
          </div>
          {opts.subtitle ? <div style={{ fontFamily: "Montserrat", fontSize: 28, lineHeight: 1.4, color: SOFT, marginTop: 28, maxWidth: 600 }}>{opts.subtitle}</div> : null}
        </div>
        <div style={{ fontFamily: "Playfair", fontStyle: "italic", fontSize: 30, color: SOFT }}>Your true form</div>
      </div>
      {/* Arches in the season's colours, overlapping like pages. */}
      <div style={{ display: "flex", alignItems: "flex-end", width: 420, position: "relative" }}>
        {tones.map((t, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: 0,
              left: i * 70,
              width: 200,
              height: 380 + (i % 2) * 60,
              borderRadius: "100px 100px 0 0",
              background: `linear-gradient(160deg, rgba(255,250,240,0.35), rgba(255,250,240,0) 55%), ${t}`,
              border: `2px solid ${IVORY}`,
            }}
          />
        ))}
      </div>
    </div>,
  );
}

/** A style: its arch (photo, or its colour), number, name, colours and price. */
export async function pieceCard(opts: {
  pieceNumber: string | null;
  title: string;
  name: string;
  price: string;
  colours: { name: string | null; hex: string | null }[];
  sizes: string[];
  photo: string | null;
}) {
  const named = opts.colours.filter((c) => c.name);
  const first = normaliseTone(named[0]?.hex ?? null);
  const photo = opts.photo ? photoJpeg(opts.photo, 440, 540) : null;
  const sizeText = opts.sizes.length > 1 ? `${opts.sizes[0]}–${opts.sizes[opts.sizes.length - 1]}` : (opts.sizes[0] ?? null);

  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", background: IVORY, padding: "45px 72px 0 72px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", width: 440, height: 585 }}>
        <div
          style={{
            display: "flex",
            width: 440,
            height: 540,
            borderRadius: "220px 220px 0 0",
            overflow: "hidden",
            background: `radial-gradient(circle at 30% 12%, rgba(255,250,240,0.45), rgba(255,250,240,0) 60%), ${first}`,
          }}
        >
          {/* The share-card renderer draws plain <img>; next/image doesn't apply here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? <img src={photo} width={440} height={540} style={{ objectFit: "cover" }} alt="" /> : null}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, marginLeft: 64, paddingBottom: 56 }}>
        <Wordmark />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {opts.pieceNumber ? <div style={{ fontFamily: "Playfair", fontSize: 34, color: SOFT }}>{opts.pieceNumber}</div> : null}
          <div style={{ fontFamily: "Playfair", fontStyle: "italic", fontSize: opts.title.length > 10 ? 96 : 128, lineHeight: 1, color: ESPRESSO, marginTop: 6 }}>{opts.title}</div>
          <div style={{ fontFamily: "Montserrat", fontSize: 28, color: SOFT, marginTop: 18 }}>{opts.name}</div>
          {named.length ? (
            <div style={{ display: "flex", alignItems: "center", marginTop: 36 }}>
              {named.slice(0, 6).map((c, i) => (
                <div key={i} style={{ width: 40, height: 40, borderRadius: 20, background: normaliseTone(c.hex), border: `1px solid ${TAUPE}`, marginRight: 14 }} />
              ))}
              <div style={{ fontFamily: "Montserrat", fontSize: 24, color: SOFT, marginLeft: 8 }}>
                {`${named.length > 1 ? `${named.length} colours` : named[0]!.name}${sizeText ? ` · ${sizeText}` : ""}`}
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ fontFamily: "Playfair, Playfair Ext", fontSize: 48, color: ESPRESSO }}>{opts.price}</div>
      </div>
    </div>,
  );
}
