"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { spinFrameUrls } from "@/lib/cloudinary-url";
import { normaliseTone } from "@/lib/tone";

/** Pixels of drag per frame: a full turn is a little more than one swipe across a phone. */
const PX_PER_FRAME = 9;

/**
 * A piece turning round, in the arch: stills cut from one video, swapped as
 * the buyer drags (or uses the arrow keys). It loads its frames only when
 * shown, and turns once by itself when they're in, so people see it moves.
 * Give it a `key` of the video so a new video starts afresh.
 */
export function SpinViewer({ video, label, tone, width = 800 }: { video: string; label: string; tone: string | null; width?: number }) {
  const frames = useMemo(() => spinFrameUrls(video, { width }), [video, width]);
  const count = frames.length;
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [touched, setTouched] = useState(false);
  const drag = useRef<{ x: number; from: number } | null>(null);

  const ready = count > 0 && loaded >= count;

  // One slow turn once everything's in, unless they've already grabbed it or prefer less motion.
  useEffect(() => {
    if (!ready || touched || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setIndex(i % count);
      if (i >= count) clearInterval(timer);
    }, 70);
    return () => clearInterval(timer);
  }, [ready, touched, count]);

  if (count === 0) return null;
  const turn = (by: number) => setIndex((i) => (((i + by) % count) + count) % count);
  const degrees = Math.round((index * 360) / count);

  return (
    <div
      className="arch relative w-full cursor-grab touch-pan-y select-none outline-offset-4 active:cursor-grabbing"
      style={{ aspectRatio: "4/5", backgroundColor: normaliseTone(tone) } as CSSProperties}
      role="slider"
      tabIndex={0}
      aria-label={`Turn ${label} round`}
      aria-valuemin={0}
      aria-valuemax={350}
      aria-valuenow={degrees}
      aria-valuetext={`Turned ${degrees}°`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") turn(1);
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") turn(-1);
        else return;
        e.preventDefault();
        setTouched(true);
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, from: index };
        setTouched(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const steps = Math.round((e.clientX - drag.current.x) / PX_PER_FRAME);
        setIndex((((drag.current.from - steps) % count) + count) % count);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Every frame loads at once and only the current one is visible, so turning never waits on the network. */}
      {frames.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- frames are sized by Cloudinary
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          onLoad={() => setLoaded((n) => n + 1)}
          onError={() => setLoaded((n) => n + 1)}
          className={`absolute inset-0 h-full w-full object-cover ${i === index ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <span className="pointer-events-none absolute inset-x-0 bottom-4 text-center">
        <span className="rounded-full bg-ivory/85 px-3 py-1 text-xs text-espresso">
          {ready ? "Drag to turn it round" : `Loading the turn… ${Math.round((loaded / count) * 100)}%`}
        </span>
      </span>
    </div>
  );
}
