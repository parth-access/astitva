"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { attachRailAction, finishRailAction, removeRailAction, signRailUploadAction } from "@/app/admin/(panel)/pieces/actions";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import type { RailSide } from "@/lib/rail";
import type { AdminRailPhoto } from "@/modules/catalog-admin/rail";
import { cardClass, FormError } from "./ui";
import { IMAGE_ACCEPT, uploadToCloudinary } from "./upload";

/** How long to wait between asking Cloudinary whether a cut-out is ready. */
const CHECK_EVERY_MS = 3000;

/**
 * Hanger shots for the clothing rail on the piece page: each colour on its
 * hanger, front and (optionally) back. Cloudinary removes the background;
 * the checkerboard behind a finished one shows what was cut away. The rail
 * appears once every colour has its front.
 */
export function RailPanel({ productId, colours, photos }: { productId: string; colours: { name: string | null; hex: string | null }[]; photos: AdminRailPhoto[] }) {
  const missing = colours.filter((c) => !photos.some((p) => p.color === c.name && p.side === "front" && p.url));
  return (
    <section className={`${cardClass} space-y-4 p-5 sm:p-6`}>
      <div>
        <h2 className="font-display text-xl">On the rail</h2>
        <p className="text-sm text-espresso-soft">
          Each colour on its hanger. Buyers swipe the rail to change colour, tap the garment to look closer and drag it round to see the back.
        </p>
      </div>

      {colours.length === 0 ? (
        <p className="text-sm text-espresso-soft">Add the piece&apos;s colours below first.</p>
      ) : (
        <ul className="space-y-4">
          {colours.map((c) => (
            <li key={c.name ?? ""} className="grid gap-3 sm:grid-cols-[8rem_1fr] sm:items-start">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="swatch relative inline-block size-4 rounded-full" style={{ backgroundColor: c.hex ?? "#d9c7ad" }} />
                {c.name ?? "The piece"}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                {(["front", "back"] as const).map((side) => (
                  <RailSlot
                    key={side}
                    productId={productId}
                    colour={c.name}
                    side={side}
                    photo={photos.find((p) => p.color === c.name && p.side === side) ?? null}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-taupe/40 pt-4 text-sm text-espresso-soft">
        <p>
          {colours.length && missing.length
            ? `The rail shows on the piece page once every colour has its front. Still to do: ${missing.map((c) => c.name ?? "the piece").join(", ")}.`
            : colours.length
              ? "Every colour has its front: the rail is on the piece page."
              : null}
        </p>
        <p>
          For shots that line up on the rail, make every colour in one go (one chat, if you use an image tool): the same hanger, size, angle, light and framing,
          the whole garment in view, upright, on a plain background. A back is optional; without one, turning the garment shows its front mirrored.
        </p>
      </div>
    </section>
  );
}

function RailSlot({ productId, colour, side, photo }: { productId: string; colour: string | null; side: RailSide; photo: AdminRailPhoto | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = uploading || pending;
  const working = photo !== null && photo.url === null;

  // While Cloudinary removes the background, ask every few seconds; show it when it's done.
  useEffect(() => {
    if (!working || !photo) return;
    let stopped = false;
    let timer = 0;
    const check = async () => {
      const r = await finishRailAction(productId, photo.id).catch(() => ({ state: "working" as const }));
      if (stopped) return;
      if (r.state === "ready") startTransition(() => router.refresh());
      else if (r.state === "failed") setError(r.error);
      else timer = window.setTimeout(check, CHECK_EVERY_MS);
    };
    timer = window.setTimeout(check, CHECK_EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [working, photo, productId, router]);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const reply = await uploadToCloudinary(file, () => signRailUploadAction(productId));
      const saved = await attachRailAction({ productId, colour, side }, reply);
      if (!saved.ok) throw new Error(saved.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
    setUploading(false);
    if (input.current) input.current.value = "";
    startTransition(() => router.refresh());
  }

  const label = side === "front" ? "Front" : "Back (optional)";
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-espresso-soft">{label}</p>
      <div className="rail-checker relative grid aspect-[3/4] place-items-center overflow-hidden rounded-md border border-taupe/50">
        {photo?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small admin preview of a transparent cut-out
          <img src={cloudinaryUrl(photo.url, { width: 320 })} alt={`${colour ?? "The piece"}, ${side}, cut out`} className="size-full object-contain" />
        ) : working ? (
          <p className="px-3 text-center text-xs text-espresso-soft" aria-live="polite">
            {error ? "Couldn't cut it out" : "Removing the background…"}
          </p>
        ) : (
          <span className="text-xs text-espresso-soft">None yet</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 text-sm">
        <label className={`link cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? "Uploading…" : photo ? "Replace" : "Upload"}
          <input
            ref={input}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        {photo ? (
          <button
            type="button"
            className="link text-burgundy"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Remove the ${side} of ${colour ?? "the piece"} from the rail? It will be deleted.`)) return;
              setError(null);
              startTransition(async () => {
                const r = await removeRailAction(productId, photo.id);
                if (!r.ok) setError(r.error);
                router.refresh();
              });
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
      <FormError message={error} />
    </div>
  );
}
