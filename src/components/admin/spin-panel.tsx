"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { attachSpinAction, removeSpinAction, signSpinUploadAction } from "@/app/admin/(panel)/pieces/actions";
import { SpinViewer } from "@/components/storefront/spin-viewer";
import { FormError } from "./ui";
import { MAX_VIDEO_BYTES, uploadToCloudinary, VIDEO_ACCEPT } from "./upload";

/**
 * The piece's turning video: buyers drag it round on the piece page. One
 * per piece; uploading another replaces it. The preview is exactly what
 * buyers see.
 */
export function SpinPanel({ productId, video, pieceLabel, tone }: { productId: string; video: string | null; pieceLabel: string; tone: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = pending || uploading;

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const reply = await uploadToCloudinary(file, () => signSpinUploadAction(productId), MAX_VIDEO_BYTES);
      const saved = await attachSpinAction(productId, reply);
      if (!saved.ok) throw new Error(saved.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
    setUploading(false);
    if (input.current) input.current.value = "";
    startTransition(() => router.refresh());
  }

  return (
    <section className="space-y-4 border border-sand p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Turning video (360°)</h2>
          <p className="text-sm text-espresso-soft">One video of the piece going round once. Buyers drag it round on the piece page.</p>
        </div>
        <label className={`btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? "Uploading…" : video ? "Replace video" : "Add video"}
          <input
            ref={input}
            type="file"
            accept={VIDEO_ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </div>

      <FormError message={error} />

      {video ? (
        <div className="grid gap-4 sm:grid-cols-[16rem_1fr] sm:items-start">
          <SpinViewer key={video} video={video} label={pieceLabel} tone={tone} width={480} />
          <div className="space-y-3 text-sm">
            <p>Drag it to check. If the start and end don&apos;t meet, trim the video to exactly one turn and upload it again.</p>
            <button
              type="button"
              className="link text-burgundy"
              disabled={busy}
              onClick={() => {
                if (!confirm("Remove the turning video? It will be deleted.")) return;
                setError(null);
                startTransition(async () => {
                  const r = await removeSpinAction(productId);
                  if (!r.ok) setError(r.error);
                  router.refresh();
                });
              }}
            >
              Remove video
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-espresso-soft">
          <p>How to film it:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Hang the piece on a hook or door frame against a plain wall, in soft daylight.</li>
            <li>Hold the phone upright and still (lean it on something), with the whole piece in the middle and space above and below.</li>
            <li>Turn the hanger slowly by its hook, one full turn in about 10 seconds, starting and stopping at the front.</li>
            <li>Trim the video to just that one turn. Under 40 MB (1080p, not 4K).</li>
          </ol>
        </div>
      )}
    </section>
  );
}
