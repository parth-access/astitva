import { EARRING_PIVOT, MASCOT_GROUND, MASCOT_PARTS, MASCOT_VIEWBOX, SKETCH_PATHS } from "./mascot-data";

/**
 * First-visit intro: the mascot is sketched in fine lines, then the painting
 * arrives part by part (hat, hair, face, earring), then the page shows.
 *
 * How it stays out of the way
 * - `INTRO_BOOT` (in <head>) decides before first paint whether to play: only
 *   on a visitor's first visit to the storefront, or with `?intro` for previews.
 *   If storage is unavailable it does not play. Without JavaScript it never shows.
 * - The page renders underneath at the same time; the intro never delays it.
 * - `INTRO_TIMELINE` runs right after this markup, without waiting for React:
 *   it loads the painted layers while the sketch draws, switches to colour when
 *   they are ready, then fades out. Any tap, click, scroll or key skips it.
 * - Reduced motion: no sketch, the painting shows briefly and leaves.
 * - A CSS failsafe hides the overlay after 7 seconds whatever happens.
 */

const STORAGE_KEY = "astitva:intro";

/** Runs in <head>. Keep it tiny and dependency-free. */
export const INTRO_BOOT = `(function(){try{var p=location.pathname;if(/^\\/(admin|checkout|orders|api)(\\/|$)/.test(p))return;var f=/[?&]intro(=|&|$)/.test(location.search);if(f||!localStorage.getItem("${STORAGE_KEY}"))document.documentElement.setAttribute("data-intro","play")}catch(e){}})();`;

const INTRO_TIMELINE = `(function(){
var root=document.documentElement,el=document.getElementById("astitva-intro");
if(!el||root.getAttribute("data-intro")!=="play")return;
try{localStorage.setItem("${STORAGE_KEY}",String(Date.now()))}catch(e){}
var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
var SKETCH=reduce?0:760,COLOUR=reduce?900:1150,MAXWAIT=3000,t0=Date.now(),left=false,failed=false;
var imgs=el.querySelectorAll("image[data-src]"),pending=imgs.length;
Array.prototype.forEach.call(imgs,function(node){var src=node.getAttribute("data-src"),im=new Image();
im.onload=function(){node.setAttribute("href",src);pending--};im.onerror=function(){failed=true;pending--};im.src=src});
function leave(fast){if(left)return;left=true;el.classList.add(fast?"is-skipped":"is-leaving");root.setAttribute("data-intro","leaving");
setTimeout(function(){root.setAttribute("data-intro","done")},fast?300:640)}
function colour(){el.classList.add("is-colour");setTimeout(function(){leave(false)},COLOUR)}
(function wait(){var t=Date.now()-t0;if(left)return;if(pending<=0&&!failed&&t>=SKETCH)return colour();
if(failed&&t>=SKETCH||t>MAXWAIT)return leave(false);setTimeout(wait,50)})();
function skip(){leave(true)}["pointerdown","keydown","wheel","touchstart"].forEach(function(e){addEventListener(e,skip,{once:true,passive:true})});
})();`;

/** Order and timing of the sketch strokes: [key, delay ms, duration ms]. */
const STROKES: [keyof typeof SKETCH_PATHS, number, number][] = [
  ["profile", 0, 465],
  ["eye", 258, 165],
  ["lips", 286, 120],
  ["crown", 82, 420],
  ["brimTopLeft", 177, 270],
  ["brimTopRight", 177, 270],
  ["rim", 218, 360],
  ["brimEdge", 245, 375],
  ["underside", 286, 270],
  ["band", 354, 240],
  ["h1", 204, 390],
  ["h8", 231, 270],
  ["h2", 245, 420],
  ["h3", 286, 420],
  ["h4", 320, 390],
  ["h5", 354, 390],
  ["h6", 381, 360],
  ["h7", 408, 330],
  ["hook", 435, 135],
  ["drop", 462, 180],
];

function InlineScript({ html }: { html: string }) {
  // text/plain on the client so React never tries to run or warn about it after hydration.
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function IntroBoot() {
  return <InlineScript html={INTRO_BOOT} />;
}

export function Intro() {
  const { width: W, height: H } = MASCOT_VIEWBOX;
  const part = (name: keyof typeof MASCOT_PARTS, extra?: { mask?: string }) => {
    const p = MASCOT_PARTS[name];
    return (
      <image
        className={`intro-part intro-${name}`}
        data-src={p.href}
        x={p.x}
        y={p.y}
        width={p.width}
        height={p.height}
        mask={extra?.mask}
        suppressHydrationWarning
      />
    );
  };

  return (
    <>
      <div
        id="astitva-intro"
        className="intro"
        aria-hidden="true"
        suppressHydrationWarning
        style={{ ["--intro-ground" as string]: MASCOT_GROUND, ["--pivot" as string]: `${EARRING_PIVOT.x}px ${EARRING_PIVOT.y}px` }}
      >
        <svg className="intro-mascot" viewBox={`0 0 ${W} ${H}`} role="presentation">
          <defs>
            <linearGradient id="intro-wash-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.5" stopColor="#fff" />
              <stop offset="0.64" stopColor="#000" />
            </linearGradient>
            <mask id="intro-wash" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              <rect className="intro-wash" x="0" y={-H} width={W} height={H * 2} fill="url(#intro-wash-gradient)" />
            </mask>
          </defs>
          {part("hair", { mask: "url(#intro-wash)" })}
          {part("face")}
          {part("earring")}
          {part("hat")}
          <path className="intro-glint" d={SKETCH_PATHS.rim} pathLength={1} />
          <g className="intro-sketch">
            {STROKES.map(([key, delay, duration]) => (
              <path
                key={key}
                d={SKETCH_PATHS[key]}
                pathLength={1}
                style={{ ["--delay" as string]: `${delay}ms`, ["--dur" as string]: `${duration}ms` }}
              />
            ))}
          </g>
        </svg>
      </div>
      <InlineScript html={INTRO_TIMELINE} />
    </>
  );
}
