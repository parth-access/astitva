"use client";

import Image from "next/image";
import { useEffect, useRef, useState, ViewTransition, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import type { RailGarment } from "@/lib/rail";

const loader = ({ src, width, quality }: { src: string; width: number; quality?: number }) => cloudinaryUrl(src, { width, quality });
const RAIL_SIZES = "(min-width: 768px) 34vw, 52vw";
const CLOSE_SIZES = "(min-width: 768px) 50vw, 72vw";

/** The garment that lifts off the rail into the closer look (and back). */
export function railTransitionName(slug: string) {
  return `rail-${slug}`;
}

const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Where a garment hangs, by its place relative to the one in front (k = 0).
 * In front it faces you; the ones after it hang behind, turned side-on,
 * further back and a little higher along the rail; the ones before have
 * gone off to the left. Units are the stage's width (cqw), so it's right
 * before any script runs.
 */
function hangAt(k: number): CSSProperties {
  if (k > -0.5 && k < 0.5) return { transform: `translate3d(${k * 40}cqw, 0, 0) rotateY(${k * -60}deg)`, zIndex: 50 };
  if (k >= 0.5) {
    const s = k - 0.5;
    return {
      transform: `translate3d(${30 + s * 11}cqw, ${-1.2 * k}cqw, ${-(35 + s * 30)}cqw) rotateY(-62deg)`,
      zIndex: 40 - Math.round(k),
      filter: `brightness(${1 - Math.min(k, 4) * 0.05})`,
    };
  }
  return { transform: "translate3d(-55cqw, 0, -30cqw) rotateY(55deg)", opacity: 0, zIndex: 1 };
}

/**
 * Every colour of a piece on its hanger, on a rail. Swipe (or drag, or the
 * arrow keys) to bring another colour to the front; tap one behind to bring
 * it forward; tap the front one to look closer. The colour is the page's
 * colour: the swatches beside it move the rail too.
 */
export function ClothingRail({
  slug,
  label,
  garments,
  colour,
  onPick,
  onOpen,
}: {
  slug: string;
  label: string;
  garments: RailGarment[];
  colour: string | null;
  onPick: (colour: string | null) => void;
  onOpen: () => void;
}) {
  const cur = Math.max(0, garments.findIndex((g) => g.colour === colour));
  const stage = useRef<HTMLDivElement>(null);
  // While dragging, how far along the rail (in garments) it has been pulled.
  const [pull, setPull] = useState<number | null>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  // The front garment swings when it arrives; a new key restarts the swing.
  const [swing, setSwing] = useState(0);
  const [shownCur, setShownCur] = useState(cur);
  if (shownCur !== cur) {
    setShownCur(cur);
    setSwing((n) => n + 1);
  }

  const go = (i: number) => {
    const next = clamp(i, 0, garments.length - 1);
    if (next !== cur) onPick(garments[next]!.colour);
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, moved: false };
    moved.current = false;
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const width = stage.current?.clientWidth;
    if (!d || !width) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) {
      d.moved = moved.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setPull(clamp(-dx / (width * 0.5), -0.9, 0.9));
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    setPull(null);
    const width = stage.current?.clientWidth;
    if (!d?.moved || !width) return;
    // The click that follows a drag isn't a tap; the next tap (or Enter) is.
    window.setTimeout(() => (moved.current = false), 0);
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > width * 0.12) go(cur + (dx < 0 ? 1 : -1));
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") go(cur + 1);
    else if (e.key === "ArrowLeft") go(cur - 1);
    else return;
    e.preventDefault();
  }

  const offset = pull ?? 0;
  const many = garments.length > 1;
  return (
    <div>
      <div
        ref={stage}
        className={`rail-stage ${pull !== null ? "is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        role="group"
        aria-label={many ? `${label}: the colours on a rail. Left and right arrow keys change the colour.` : label}
      >
        <span className="rail-bar" aria-hidden="true" />
        {garments.map((g, i) => {
          const k = i - cur - offset;
          const front = i === cur;
          const img = (
            <Image
              src={g.front.url}
              alt=""
              loader={loader}
              width={g.front.width ?? 900}
              height={g.front.height ?? 1200}
              sizes={RAIL_SIZES}
              priority={front}
              draggable={false}
              className="rail-garment"
              // The front garment is what flies into the bag.
              data-bag-source={front ? "" : undefined}
            />
          );
          return (
            <button
              key={g.colour ?? ""}
              type="button"
              className="rail-hang"
              style={hangAt(k)}
              tabIndex={front ? 0 : -1}
              aria-label={front ? `Look closer at the ${g.colour ?? "piece"}` : `Show ${g.colour ?? "this colour"}`}
              onClick={() => {
                if (moved.current) return;
                if (front) onOpen();
                else go(i);
              }}
            >
              <span key={front ? `swing-${swing}` : "still"} className={`rail-swing ${front && swing > 0 ? "is-swinging" : ""}`}>
                {front ? (
                  <ViewTransition name={railTransitionName(slug)} share="morph" default="none">
                    {img}
                  </ViewTransition>
                ) : (
                  img
                )}
              </span>
            </button>
          );
        })}
        <span className="rail-hint" aria-hidden="true">
          Tap to look closer
        </span>
      </div>
    </div>
  );
}

/**
 * The garment from the rail, close up, to turn round: its front and back
 * back to back, turned by dragging (or the arrow keys, or the button). Let
 * go and it settles facing you or facing away; a flick carries it on, at
 * most one turn more. It peeks round once when it opens. Without a shot of
 * the back it doesn't turn: buyers only ever see the real garment.
 */
export function HangerTurn({ slug, label, garment }: { slug: string; label: string; garment: RailGarment }) {
  const turn = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const faces = useRef<(HTMLImageElement | null)[]>([]);
  const angle = useRef(0);
  const [showingBack, setShowingBack] = useState(false);
  const back = garment.back;

  /** Turns to `a` degrees, swinging from the hook by `swing`; `settle` animates there. */
  function setAngle(a: number, { swing = 0, settle = false } = {}) {
    const el = turn.current;
    const hook = tilt.current;
    if (!el || !hook) return;
    angle.current = a;
    el.classList.toggle("is-settling", settle);
    el.style.transform = `rotateY(${a}deg)`;
    const facing = Math.cos((a * Math.PI) / 180);
    el.style.setProperty("--lit", (0.8 + 0.2 * Math.abs(facing)).toFixed(3));
    hook.style.transform = `rotateZ(${clamp(swing, -5, 5)}deg)`;
    const away = facing < 0;
    // The bag flight takes whichever face is towards the buyer.
    faces.current[0]?.toggleAttribute("data-bag-source", !away);
    faces.current[1]?.toggleAttribute("data-bag-source", away);
    setShowingBack(away);
  }
  const nearest = (a: number) => Math.round(a / 180) * 180;

  // Once, a small peek round, so it's plain that it turns.
  useEffect(() => {
    if (!back || still()) return;
    const timers = [window.setTimeout(() => setAngle(32, { settle: true }), 900), window.setTimeout(() => setAngle(0, { settle: true }), 1650)];
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when it opens
  }, []);

  const drag = useRef<{ last: number; t: number; vel: number } | null>(null);
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { last: e.clientX, t: e.timeStamp, vel: 0 };
    turn.current?.classList.add("is-grabbed");
    if (tilt.current) tilt.current.style.transition = "none";
    // The same pose, with a smaller number.
    setAngle(((angle.current % 360) + 360) % 360);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.t);
    d.vel = 0.7 * d.vel + 0.3 * ((e.clientX - d.last) / dt); // px per ms, smoothed
    setAngle(angle.current + (e.clientX - d.last) * 0.55, { swing: d.vel * 6 });
    d.last = e.clientX;
    d.t = e.timeStamp;
  }
  function onPointerUp() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    turn.current?.classList.remove("is-grabbed");
    if (tilt.current) tilt.current.style.transition = "";
    setAngle(nearest(angle.current + clamp(d.vel * 140, -360, 360)), { settle: true });
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    e.stopPropagation();
    setAngle(nearest(angle.current) + (e.key === "ArrowRight" ? 180 : -180), { settle: true });
  }

  const face = (photo: RailGarment["front"], i: 0 | 1, extra = "") => (
    <Image
      ref={(el) => {
        faces.current[i] = el;
      }}
      src={photo.url}
      alt=""
      loader={loader}
      width={photo.width ?? 900}
      height={photo.height ?? 1200}
      sizes={CLOSE_SIZES}
      priority={i === 0}
      draggable={false}
      className={`hanger-face ${extra}`}
      data-bag-source={i === 0 ? "" : undefined}
    />
  );

  if (!back) {
    return (
      <div className="hanger-turn">
        <div className="hanger-tilt">
          <div className="hanger-spin" role="img" aria-label={`${label}, on its hanger.`}>
            <ViewTransition name={railTransitionName(slug)} share="morph" default="none">
              {face(garment.front, 0)}
            </ViewTransition>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hanger-turn">
      <div ref={tilt} className="hanger-tilt">
        <div
          ref={turn}
          className="hanger-spin is-turnable"
          tabIndex={0}
          role="img"
          aria-label={`${label}, on its hanger. Drag or use the arrow keys to turn it round.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <ViewTransition name={railTransitionName(slug)} share="morph" default="none">
            {face(garment.front, 0)}
          </ViewTransition>
          {face(back, 1, "is-rear")}
        </div>
      </div>
      <button type="button" className="hanger-hint" onClick={() => setAngle(nearest(angle.current) + 180, { settle: true })}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
          <path d="M18 3v4h-4M6 21v-4h4" />
        </svg>
        {showingBack ? "The back · turn it again" : "Drag to turn it round"}
      </button>
    </div>
  );
}
