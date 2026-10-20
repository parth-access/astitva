"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  saveChapterAction,
  setChapterCoverAction,
  setChapterStatusAction,
  signChapterCoverUploadAction,
} from "@/app/admin/(panel)/chapters/actions";
import type { FormState } from "@/app/admin/(panel)/pieces/actions";
import { Letter } from "@/components/brand/letter";
import { cloudinaryUrl } from "@/lib/cloudinary-url";
import { slugify } from "@/modules/catalog-admin/fields";
import { Field, FormError, Section, StatusBadge, SubmitButton, TextArea } from "./ui";
import { IMAGE_ACCEPT, uploadToCloudinary } from "./upload";

const empty: FormState = { errors: {} };

export function ChapterEditor({
  chapterId,
  initial,
  suggestedNumber,
  locked,
}: {
  chapterId: string | null;
  initial: Record<string, string>;
  suggestedNumber: number;
  /** Published: number and web address can't change. */
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(saveChapterAction.bind(null, chapterId), empty);
  const values = state.values ?? initial;
  const v = (name: string) => values[name] ?? "";
  const e = (name: string) => state.errors[name];

  const [title, setTitle] = useState(v("title"));
  const [slug, setSlug] = useState(v("slug"));
  const [slugTouched, setSlugTouched] = useState(Boolean(v("slug")));
  const [tone, setTone] = useState(v("tone"));
  const [letter, setLetter] = useState(v("letter"));
  const [signature, setSignature] = useState(v("letterSignature"));
  const [preview, setPreview] = useState(false);
  const count = Object.keys(state.errors).length;

  return (
    <form action={action} className="space-y-10 pb-28" noValidate>
      {count > 0 ? (
        <FormError message={state.errors.form ?? `Please check ${count === 1 ? "the field" : `the ${count} fields`} marked below.`} />
      ) : null}

      <Section title="The chapter">
        <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
          <Field
            label="Number"
            name="number"
            inputMode="numeric"
            defaultValue={v("number") || String(suggestedNumber)}
            readOnly={locked}
            error={e("number")}
            hint={locked ? "Fixed while published." : "Shown as I, II, III…"}
          />
          <Field
            label="Title"
            name="title"
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            maxLength={80}
            placeholder="Aarambh"
            error={e("title")}
          />
        </div>
        <Field label="Subtitle" name="subtitle" defaultValue={v("subtitle")} maxLength={200} error={e("subtitle")} hint="One line under the title." />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Release (India time)"
            name="releaseAt"
            type="datetime-local"
            defaultValue={v("releaseAt")}
            error={e("releaseAt")}
            hint="Shown on the site. Checkout will refuse orders before it."
          />
          <Field
            label="Web address"
            name="slug"
            value={slugTouched ? slug : slugify(title)}
            onChange={(ev) => {
              setSlug(ev.target.value);
              setSlugTouched(true);
            }}
            readOnly={locked}
            error={e("slug")}
            hint={locked ? "Fixed while published." : "Made from the title. The page lives at /chapters/ and this."}
          />
        </div>
        <div className="flex items-end gap-3 sm:w-1/2">
          <div className="flex-1">
            <Field
              label="Tone"
              name="tone"
              value={tone}
              onChange={(ev) => setTone(ev.target.value)}
              placeholder="#d9c7ad"
              error={e("tone")}
              hint="Shown while the cover loads."
            />
          </div>
          <input
            type="color"
            aria-label="Pick the tone"
            value={/^#[0-9a-f]{6}$/i.test(tone) ? tone : "#d9c7ad"}
            onChange={(ev) => setTone(ev.target.value)}
            className="mb-6 h-12 w-12 shrink-0 cursor-pointer border border-taupe bg-ivory p-1"
          />
        </div>
      </Section>

      <Section title="The letter" intro="Krishna's letter that opens the chapter. A blank line starts a new paragraph. A draft until she confirms it.">
        <div className="flex gap-4 text-sm" role="tablist">
          <button type="button" role="tab" aria-selected={!preview} className={preview ? "link" : "font-medium"} onClick={() => setPreview(false)}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={preview} className={preview ? "font-medium" : "link"} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
        {/* Kept in the form while previewing, so nothing is lost. */}
        <div hidden={preview} className="space-y-5">
          <TextArea label="Letter" name="letter" rows={14} value={letter} onChange={(ev) => setLetter(ev.target.value)} error={e("letter")} />
          <Field
            label="Signed"
            name="letterSignature"
            value={signature}
            onChange={(ev) => setSignature(ev.target.value)}
            maxLength={60}
            placeholder="Krishna"
            error={e("letterSignature")}
          />
        </div>
        {preview ? (
          <div className="-mx-4 border-y border-sand bg-ivory py-10">
            {letter.trim() ? (
              <Letter text={letter} signature={signature.trim() || null} id="letter-preview" />
            ) : (
              <p className="px-4 text-sm text-espresso-soft">Nothing written yet.</p>
            )}
          </div>
        ) : null}
      </Section>

      <Section title="Cover description">
        <Field
          label="Describe the cover photo"
          name="coverImageAlt"
          defaultValue={v("coverImageAlt")}
          maxLength={240}
          error={e("coverImageAlt")}
          hint="Read aloud to people who can't see it. Set the photo itself above."
        />
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-sand bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-espresso-soft" aria-live="polite">
            {count ? "Not saved yet." : ""}
          </span>
          <div className="flex items-center gap-4">
            <Link href="/admin/chapters" className="link text-sm">
              {chapterId ? "Back to chapters" : "Cancel"}
            </Link>
            <div className="w-40">
              <SubmitButton pending={pending}>{chapterId ? "Save" : "Create draft"}</SubmitButton>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

export function ChapterStatusPanel({
  chapterId,
  status,
  slug,
  hasRelease,
}: {
  chapterId: string;
  status: "draft" | "published";
  slug: string;
  hasRelease: boolean;
}) {
  const [state, action, pending] = useActionState(setChapterStatusAction.bind(null, chapterId), empty);
  const publish = status === "draft";
  return (
    <div className="space-y-4 border border-sand p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg">Status</h2>
        <StatusBadge status={status} />
      </div>
      <p className="text-sm text-espresso-soft">
        {publish
          ? "Not on the site. Publishing shows its cover, letter and page, and fixes its number and web address."
          : "On the site. Unpublishing hides the chapter page; its pieces stay on the site."}
      </p>
      {!publish ? (
        <a href={`/chapters/${slug}`} target="_blank" rel="noreferrer" className="link text-sm">
          View on the site
        </a>
      ) : null}
      {publish && !hasRelease ? <p className="text-sm">Set a release date and save before publishing.</p> : null}
      <FormError message={state.errors.form ?? null} />
      <form action={action}>
        <input type="hidden" name="to" value={publish ? "published" : "draft"} />
        {publish ? (
          <SubmitButton pending={pending || !hasRelease}>Publish</SubmitButton>
        ) : (
          <button type="submit" className="btn-outline w-full" disabled={pending}>
            {pending ? "One moment…" : "Unpublish"}
          </button>
        )}
      </form>
    </div>
  );
}

/** The chapter's cover photo. Until there is one, the site shows the Astitva woman in the arch. */
export function CoverPanel({ chapterId, url, alt }: { chapterId: string; url: string | null; alt: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function run(label: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setBusy(label);
    try {
      const r = await fn();
      if (!r.ok) setError(r.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
      startTransition(() => router.refresh());
    }
  }

  const disabled = busy !== null || pending;
  return (
    <div className="space-y-4 border border-sand p-4">
      <h2 className="font-display text-lg">Cover</h2>
      <div className="aspect-[3/4] overflow-hidden bg-sand">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview, sized by Cloudinary
          <img src={cloudinaryUrl(url, { width: 480, height: 640 })} alt={alt || "Chapter cover"} className="h-full w-full object-cover" />
        ) : (
          <p className="flex h-full items-center p-4 text-center text-sm text-espresso-soft">
            No cover yet. The site shows the Astitva woman in the arch until there is one.
          </p>
        )}
      </div>
      <FormError message={error} />
      <label className={`btn-outline w-full cursor-pointer ${disabled ? "pointer-events-none opacity-60" : ""}`}>
        {busy ?? (url ? "Replace cover" : "Add cover")}
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void run("Uploading…", async () =>
                setChapterCoverAction(chapterId, await uploadToCloudinary(file, () => signChapterCoverUploadAction(chapterId))),
              );
          }}
        />
      </label>
      {url ? (
        <button
          type="button"
          className="link text-sm text-burgundy"
          disabled={disabled}
          onClick={() => {
            if (confirm("Remove the cover photo? It will be deleted.")) void run("Removing…", () => setChapterCoverAction(chapterId, null));
          }}
        >
          Remove cover
        </button>
      ) : null}
    </div>
  );
}
