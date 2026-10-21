"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { savePieceAction, type FormState } from "@/app/admin/(panel)/pieces/actions";
import { CONDITION_LABELS, CONDITIONS, slugify } from "@/modules/catalog-admin/fields";
import { Field, FormError, saveBarClass, Section, Select, SubmitButton, TextArea } from "./ui";
import { VariantBuilder } from "./variant-builder";

export type EditorOptions = {
  categories: { id: string; name: string }[];
  suggestedNumber: number;
};

type Props = {
  productId: string | null;
  /** Saved values by form field name (see modules/catalog-admin/input.ts). */
  initial: Record<string, string>;
  options: EditorOptions;
  /** True once the piece has ever been published: number and address are fixed. */
  locked: boolean;
};

const empty: FormState = { errors: {} };

export function PieceEditor({ productId, initial, options, locked }: Props) {
  const [state, action, pending] = useActionState(savePieceAction.bind(null, productId), empty);
  // After a failed save React resets the form; show what was typed, not what was saved.
  const values = state.values ?? initial;
  const v = (name: string) => values[name] ?? "";
  const e = (name: string) => state.errors[name];

  const [tone, setTone] = useState(v("tone"));
  const [slug, setSlug] = useState(v("slug"));
  const [slugTouched, setSlugTouched] = useState(Boolean(v("slug")));
  const [names, setNames] = useState({ pieceName: v("pieceName"), name: v("name") });
  const autoSlug = slugify(names.pieceName, names.name);

  const firstError = Object.entries(state.errors).find(([k]) => k === "form")?.[1];
  const count = Object.keys(state.errors).length;

  return (
    <form action={action} className="space-y-6 pb-28" noValidate>
      {count > 0 ? (
        <FormError message={firstError ?? `Please check ${count === 1 ? "the field" : `the ${count} fields`} marked below.`} />
      ) : null}

      <Section title="The piece">
        <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
          <Field
            label="Number"
            name="pieceNumber"
            inputMode="numeric"
            defaultValue={v("pieceNumber") || (productId ? "" : String(options.suggestedNumber))}
            readOnly={locked}
            error={e("pieceNumber")}
            hint={locked ? "Fixed once published." : "Never reused."}
          />
          <Field
            label="Name"
            name="pieceName"
            defaultValue={v("pieceName")}
            maxLength={60}
            placeholder="Saanjh"
            error={e("pieceName")}
            hint="The piece's own name, shown in italics."
            onChange={(ev) => setNames((n) => ({ ...n, pieceName: ev.target.value }))}
          />
        </div>
        <Field
          label="What it is"
          name="name"
          defaultValue={v("name")}
          maxLength={160}
          placeholder="Taupe knit midi dress"
          error={e("name")}
          onChange={(ev) => setNames((n) => ({ ...n, name: ev.target.value }))}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Category" name="categoryId" defaultValue={v("categoryId")} error={e("categoryId")}>
            <option value="">None</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Field
                label="Tone"
                name="tone"
                value={tone}
                onChange={(ev) => setTone(ev.target.value)}
                placeholder="#6b6b46"
                error={e("tone")}
                hint="Optional. Shown while photos load. Each colour's own swatch is used where there is one."
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
          <Field
            label="Web address"
            name="slug"
            value={slugTouched ? slug : autoSlug}
            onChange={(ev) => {
              setSlug(ev.target.value);
              setSlugTouched(true);
            }}
            readOnly={locked}
            error={e("slug")}
            hint={locked ? "Fixed once published." : "Made from the name. The piece's page lives at /pieces/ and this."}
          />
        </div>
      </Section>

      <Section title="In Krishna's words" intro="Drafts until Krishna confirms them.">
        <TextArea
          label="Story"
          name="story"
          rows={4}
          defaultValue={v("story")}
          error={e("story")}
          hint="What makes it special. The first sentence shows on its lookbook page."
        />
        <TextArea
          label="Styling note"
          name="stylingNote"
          rows={2}
          defaultValue={v("stylingNote")}
          error={e("stylingNote")}
          hint="How she would wear it. Shown as a signed quote."
        />
        <TextArea label="Description" name="description" rows={3} defaultValue={v("description")} error={e("description")} />
      </Section>

      <Section title="Details">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Material" name="material" defaultValue={v("material")} error={e("material")} placeholder="Linen blend" />
          <Field label="Fit" name="fit" defaultValue={v("fit")} error={e("fit")} placeholder="Relaxed, ties at the waist" />
        </div>
        <Field
          label="Care"
          name="careInstructions"
          defaultValue={v("careInstructions")}
          error={e("careInstructions")}
          placeholder="Hand wash cold, dry in shade"
        />
      </Section>

      <Section title="Price">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label="Price (₹)"
            name="priceMinor"
            inputMode="decimal"
            defaultValue={v("priceMinor")}
            placeholder="3499"
            error={e("priceMinor")}
            hint="Including tax. Same for every colour and size."
          />
          <Field
            label="Original price (₹)"
            name="compareAtMinor"
            inputMode="decimal"
            defaultValue={v("compareAtMinor")}
            error={e("compareAtMinor")}
            hint="Only if it's reduced. Shown struck through."
          />
          <Select label="Condition" name="condition" defaultValue={v("condition")} error={e("condition")}>
            <option value="">New (not stated)</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
      </Section>

      <Section title="Colours, sizes and stock" intro="Add the colours and sizes you have, then how many of each. The shop shows only what's here.">
        <VariantBuilder values={values} errors={state.errors} />
      </Section>

      <Section title="Private" intro="Only visible here. Never shown on the site.">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label="What one cost (₹)"
            name="acquisitionCostMinor"
            inputMode="decimal"
            defaultValue={v("acquisitionCostMinor")}
            error={e("acquisitionCostMinor")}
          />
          <Field label="Bought on" name="acquiredAt" type="date" defaultValue={v("acquiredAt")} error={e("acquiredAt")} />
          <Field label="Your reference" name="internalRef" defaultValue={v("internalRef")} error={e("internalRef")} placeholder="Supplier, lot" />
        </div>
      </Section>

      <Section title="Search listing" intro="Optional. How the piece appears in Google. Left blank, the name and story are used.">
        <Field label="Title" name="seoTitle" defaultValue={v("seoTitle")} maxLength={160} error={e("seoTitle")} />
        <TextArea label="Description" name="seoDescription" rows={2} defaultValue={v("seoDescription")} maxLength={320} error={e("seoDescription")} />
      </Section>

      <div className={saveBarClass}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-espresso-soft" aria-live="polite">
            {count ? "Not saved yet." : ""}
          </span>
          <div className="flex items-center gap-4">
            <Link href="/admin/pieces" className="link text-sm">
              {productId ? "Back to pieces" : "Cancel"}
            </Link>
            <div className="w-40">
              <SubmitButton pending={pending}>{productId ? "Save" : "Create draft"}</SubmitButton>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
