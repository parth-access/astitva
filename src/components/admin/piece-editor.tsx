"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { savePieceAction, type FormState } from "@/app/admin/(panel)/pieces/actions";
import { CONDITION_LABELS, CONDITIONS, MEASUREMENT_FIELDS, slugify } from "@/modules/catalog-admin/fields";
import { Field, FormError, Section, Select, SubmitButton, TextArea } from "./ui";

export type EditorRow = { index: number; id: string | null; sku: string | null; onHand: number };
export type EditorOptions = {
  chapters: { id: string; number: number; title: string }[];
  categories: { id: string; name: string }[];
  suggestedNumber: number;
};

type Props = {
  productId: string | null;
  /** Saved values by form field name (see modules/catalog-admin/input.ts). */
  initial: Record<string, string>;
  rows: EditorRow[];
  options: EditorOptions;
  /** True once the piece has ever been published: number and address are fixed. */
  locked: boolean;
};

const empty: FormState = { errors: {} };

export function PieceEditor({ productId, initial, rows: initialRows, options, locked }: Props) {
  const [state, action, pending] = useActionState(savePieceAction.bind(null, productId), empty);
  const [rows, setRows] = useState(initialRows);
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
    <form action={action} className="space-y-10 pb-28" noValidate>
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
          <Select label="Chapter" name="chapterId" defaultValue={v("chapterId")} error={e("chapterId")}>
            <option value="">Not in a chapter yet</option>
            {options.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number}. {c.title}
              </option>
            ))}
          </Select>
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
                hint="The piece's main colour. Shown while photos load, and instead of them until they exist."
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
          hint="Where and how it was found. The first sentence shows under the photo."
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

      <Section title="Sizes and price" intro="Most pieces are one of one: a single size with 1 in stock.">
        {rows.map((row, i) => {
          const p = `v.${row.index}.`;
          return (
            <fieldset key={row.index} className="space-y-5 border border-sand p-4">
              <legend className="px-2 text-sm text-espresso-soft">
                {rows.length > 1 ? `Size ${i + 1}` : "Size"}
                {row.sku ? ` · ${row.sku}` : " · new"}
              </legend>
              {row.id ? <input type="hidden" name={`${p}id`} value={row.id} /> : null}
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Size" name={`${p}size`} defaultValue={v(`${p}size`)} placeholder="M, or Free size" error={e(`${p}size`)} />
                <Field
                  label="Price (₹)"
                  name={`${p}priceMinor`}
                  inputMode="decimal"
                  defaultValue={v(`${p}priceMinor`)}
                  placeholder="3499"
                  error={e(`${p}priceMinor`)}
                  hint="Including tax."
                />
                <Field
                  label="Original price (₹)"
                  name={`${p}compareAtMinor`}
                  inputMode="decimal"
                  defaultValue={v(`${p}compareAtMinor`)}
                  error={e(`${p}compareAtMinor`)}
                  hint="Only if it's reduced. Shown struck through."
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <Select label="Condition" name={`${p}condition`} defaultValue={v(`${p}condition`)} error={e(`${p}condition`)}>
                  <option value="">Not stated</option>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_LABELS[c]}
                    </option>
                  ))}
                </Select>
                {row.id ? (
                  <div>
                    <span className="text-sm font-medium">In stock</span>
                    <p className="mt-1.5 flex min-h-12 items-center text-lg">
                      {/* From the latest server render, so a stock change shows without losing edits here. */}
                      {initialRows.find((r) => r.id === row.id)?.onHand ?? row.onHand}
                    </p>
                    <span className="block text-xs text-espresso-soft">Change it under Stock, below.</span>
                  </div>
                ) : (
                  <Field
                    label="In stock"
                    name={`${p}initialStock`}
                    inputMode="numeric"
                    defaultValue={v(`${p}initialStock`) || "1"}
                    error={e(`${p}initialStock`)}
                  />
                )}
                <label className="flex items-center gap-3 self-center text-sm sm:mt-6">
                  <input
                    type="checkbox"
                    name={`${p}isActive`}
                    // Unticked boxes aren't submitted, so after a failed save "missing" means off.
                    defaultChecked={state.values ? state.values[`${p}isActive`] === "on" : (initial[`${p}isActive`] ?? "on") === "on"}
                    className="size-4 accent-burgundy"
                  />
                  On sale
                </label>
              </div>

              <details>
                <summary className="cursor-pointer text-sm font-medium">Measurements (cm)</summary>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-6">
                  {MEASUREMENT_FIELDS.map(([key, label]) => (
                    <Field
                      key={key}
                      label={label}
                      name={`${p}${key}`}
                      inputMode="decimal"
                      defaultValue={v(`${p}${key}`)}
                      error={e(`${p}${key}`)}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-espresso-soft">Garment measurements, laid flat and doubled where it wraps around.</p>
              </details>

              <details>
                <summary className="cursor-pointer text-sm font-medium">Private: cost and reference</summary>
                <p className="mt-2 text-xs text-espresso-soft">Only visible here. Never shown on the site.</p>
                <div className="mt-4 grid gap-5 sm:grid-cols-3">
                  <Field
                    label="What it cost (₹)"
                    name={`${p}acquisitionCostMinor`}
                    inputMode="decimal"
                    defaultValue={v(`${p}acquisitionCostMinor`)}
                    error={e(`${p}acquisitionCostMinor`)}
                  />
                  <Field
                    label="Bought on"
                    name={`${p}acquiredAt`}
                    type="date"
                    defaultValue={v(`${p}acquiredAt`)}
                    error={e(`${p}acquiredAt`)}
                  />
                  <Field
                    label="Your reference"
                    name={`${p}internalRef`}
                    defaultValue={v(`${p}internalRef`)}
                    error={e(`${p}internalRef`)}
                    placeholder="Sarojini, stall 14"
                  />
                </div>
              </details>

              {!row.id && rows.length > 1 ? (
                <button type="button" className="link text-sm" onClick={() => setRows(rows.filter((r) => r !== row))}>
                  Remove this size
                </button>
              ) : null}
            </fieldset>
          );
        })}
        <button
          type="button"
          className="btn-outline"
          onClick={() => setRows([...rows, { index: Math.max(-1, ...rows.map((r) => r.index)) + 1, id: null, sku: null, onHand: 0 }])}
        >
          Add another size
        </button>
      </Section>

      <Section title="Search listing" intro="Optional. How the piece appears in Google. Left blank, the name and story are used.">
        <Field label="Title" name="seoTitle" defaultValue={v("seoTitle")} maxLength={160} error={e("seoTitle")} />
        <TextArea label="Description" name="seoDescription" rows={2} defaultValue={v("seoDescription")} maxLength={320} error={e("seoDescription")} />
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-sand bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
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
