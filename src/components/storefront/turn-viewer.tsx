"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { ANGLE_LABEL, type TurnFrame } from "@/lib/photo-turn";
import { normaliseTone } from "@/lib/tone";

/** Share of the arch's width to drag for a quarter turn. */
const QUARTER = 0.4;
/** Milliseconds for a quarter turn when it moves by itself (a tap, a key, the first look). */
const STEP_MS = 420;

/** `n` brought round onto 0 … count − 1: the frames are a circle. */
const wrap = (n: number, count: number) => ((n % count) + count) % count;

/**
 * A piece turned round from its front, side and back photos, in the arch.
 * Dragging fades from one to the next, so it moves with the finger; letting
 * go settles on the nearest. Arrow keys and the names below step a quarter
 * turn. It goes round once by itself when it opens, so people see it moves.
 * Give it a `key` of the colour so a new colour starts afresh.
 */
export function TurnViewer({ frames, label, tone }: { frames: TurnFrame[]; label: string; tone: string | null }) {
  const count = frames.length;
  // Position round the turn: 0 front, 1 side, 2 back, 3 other side; fractions are in between.
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const [touched, setTouched] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const drag = useRef<{ x: number; from: number; width: number } | null>(null);
  const anim = useRef<number | null>(null);

  const place = (p: number) => {
    posRef.current = p;
    setPos(p);
  };
  const stop = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  /** Glide to `target` (any number: the turn wraps), then rest there. */
  const glide = (target: number, onDone?: () => void) => {
    stop();
    const from = posRef.current;
    const ms = Math.max(120, Math.abs(target - from) * STEP_MS);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      place(from + (target - from) * eased);
      if (t < 1) anim.current = requestAnimationFrame(tick);
      else {
        anim.current = null;
        place(wrap(target, count));
        onDone?.();
      }
    };
    anim.current = requestAnimationFrame(tick);
  };

  /** The nearest way round to frame `i` from where it is now. */
  const toFrame = (i: number) => {
    const at = posRef.current;
    let d = wrap(i - at, count);
    if (d > count / 2) d -= count;
    glide(at + d);
  };

  const ready = loaded >= count;

  // Once everything's in: round once, a quarter at a time, unless they've grabbed it or prefer less motion.
  useEffect(() => {
    if (!ready || touched || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let step = 0;
    let pause: ReturnType<typeof setTimeout>;
    const next = () => {
      step += 1;
      glide(step, () => {
        if (step < count) pause = setTimeout(next, 350);
      });
    };
    pause = setTimeout(next, 500);
    return () => {
      clearTimeout(pause);
      stop();
    };
    // glide only reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, touched, count]);

  useEffect(() => stop, []);

  const base = Math.floor(pos);
  const a = wrap(base, count);
  const b = wrap(base + 1, count);
  const blend = pos - base;
  const nearest = wrap(Math.round(pos), count);

  return (
    <div>
      <div
        className="arch relative w-full cursor-grab touch-pan-y select-none outline-offset-4 active:cursor-grabbing"
        style={{ aspectRatio: "4/5", backgroundColor: normaliseTone(tone) } as CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label={`Turn ${label} round`}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={nearest}
        aria-valuetext={ANGLE_LABEL[frames[nearest]!.angle]}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") toFrame(nearest + 1);
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") toFrame(nearest - 1);
          else return;
          e.preventDefault();
          setTouched(true);
        }}
        onPointerDown={(e) => {
          stop();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // A pointer the browser no longer tracks: the drag still works while it stays over the arch.
          }
          drag.current = { x: e.clientX, from: posRef.current, width: e.currentTarget.clientWidth || 1 };
          setTouched(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const quarters = (e.clientX - drag.current.x) / (drag.current.width * QUARTER);
          place(drag.current.from - quarters);
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          drag.current = null;
          glide(Math.round(posRef.current));
        }}
        onPointerCancel={() => {
          drag.current = null;
          glide(Math.round(posRef.current));
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {/* All four load at once; the one it's at shows, and the next fades in over it as it turns. */}
        {frames.map((f, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- frames are sized by Cloudinary
          <img
            key={`${f.url}:${f.mirrored}`}
            src={cloudinaryUrl(f.url, { width: 900, height: 1125 })}
            alt=""
            draggable={false}
            onLoad={() => setLoaded((n) => n + 1)}
            onError={() => setLoaded((n) => n + 1)}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: i === a ? 1 : i === b ? blend : 0,
              zIndex: i === b ? 2 : i === a ? 1 : 0,
              transform: f.mirrored ? "scaleX(-1)" : undefined,
            }}
          />
        ))}
        <span className="pointer-events-none absolute inset-x-0 bottom-4 z-10 text-center">
          <span className="rounded-full bg-ivory/85 px-3 py-1 text-xs text-espresso">{ready ? "Drag to turn it round" : "Loading…"}</span>
        </span>
      </div>
      <p className="mt-3 flex justify-center gap-4 text-sm" aria-label="Views">
        {frames.map((f, i) => (
          <button
            key={f.angle}
            type="button"
            aria-pressed={i === nearest}
            onClick={() => {
              setTouched(true);
              toFrame(i);
            }}
            className={`link ${i === nearest ? "text-espresso" : "text-espresso-soft no-underline"}`}
          >
            {ANGLE_LABEL[f.angle]}
          </button>
        ))}
      </p>
    </div>
  );
}
