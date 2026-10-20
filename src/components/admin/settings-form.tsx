"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormState } from "@/app/admin/(panel)/pieces/actions";
import { saveSettingsAction } from "@/app/admin/(panel)/settings/actions";
import { Letter } from "@/components/brand/letter";
import { Field, FormError, Section, SubmitButton, TextArea } from "./ui";

const empty: FormState = { errors: {} };

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveSettingsAction, empty);
  const values = state.values ?? initial;
  const v = (k: string) => values[k] ?? "";
  const e = (k: string) => state.errors[k];
  const [note, setNote] = useState(v("note"));
  const [signature, setSignature] = useState(v("noteSignature"));
  const [preview, setPreview] = useState(false);
  const [open, setOpen] = useState(v("orderingOpen") === "on");
  const [cod, setCod] = useState(v("codEnabled") === "on");
  const count = Object.keys(state.errors).length;

  return (
    <form action={action} className="space-y-10 pb-28" noValidate>
      {count ? <FormError message={`Please check ${count === 1 ? "the field" : `the ${count} fields`} marked below.`} /> : null}

      <Section title="Ordering">
        <label className="flex cursor-pointer items-start gap-4">
          <span className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center">
            <input
              type="checkbox"
              name="orderingOpen"
              checked={open}
              onChange={(ev) => setOpen(ev.target.checked)}
              className="peer sr-only"
            />
            <span className="absolute inset-0 rounded-full bg-sand transition-colors peer-checked:bg-olive peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-burgundy" />
            <span className="absolute left-1 size-5 rounded-full bg-ivory shadow transition-transform duration-200 peer-checked:translate-x-5" />
          </span>
          <span>
            <span className="font-medium">{open ? "Customers can order" : "Preview only: ordering is closed"}</span>
            <span className="mt-1 block text-sm text-espresso-soft">
              While closed, the site says so at the top and there is no bag or checkout. Open it at launch.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Delivery and payment" intro="What checkout charges. Amounts in rupees, tax included.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Shipping"
            name="shippingFlatMinor"
            inputMode="decimal"
            defaultValue={v("shippingFlatMinor")}
            error={e("shippingFlatMinor")}
            hint="Per order. 0 for free shipping."
          />
          <Field
            label="Free shipping from"
            name="freeShippingThresholdMinor"
            inputMode="decimal"
            defaultValue={v("freeShippingThresholdMinor")}
            error={e("freeShippingThresholdMinor")}
            hint="Orders at or above this ship free. Blank: never."
          />
        </div>
        <label className="flex cursor-pointer items-start gap-4">
          <span className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center">
            <input type="checkbox" name="codEnabled" checked={cod} onChange={(ev) => setCod(ev.target.checked)} className="peer sr-only" />
            <span className="absolute inset-0 rounded-full bg-sand transition-colors peer-checked:bg-olive peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-burgundy" />
            <span className="absolute left-1 size-5 rounded-full bg-ivory shadow transition-transform duration-200 peer-checked:translate-x-5" />
          </span>
          <span>
            <span className="font-medium">{cod ? "Cash on delivery is on" : "Cash on delivery is off"}</span>
            <span className="mt-1 block text-sm text-espresso-soft">
              Until online payment arrives, this is the only way to pay: with it off, nobody can check out.
            </span>
          </span>
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Cash-on-delivery fee"
            name="codFeeMinor"
            inputMode="decimal"
            defaultValue={v("codFeeMinor")}
            error={e("codFeeMinor")}
            hint="Added to COD orders. 0 for none."
          />
          <Field
            label="Cash-on-delivery limit"
            name="codMaxOrderMinor"
            inputMode="decimal"
            defaultValue={v("codMaxOrderMinor")}
            error={e("codMaxOrderMinor")}
            hint="Larger orders are asked to message you."
          />
        </div>
      </Section>

      <Section title="The lookbook" intro="The home page opens with these.">
        <Field label="Title" name="lookbookTitle" defaultValue={v("lookbookTitle")} maxLength={80} placeholder="Autumn–Winter 2026" error={e("lookbookTitle")} />
        <Field
          label="One line under it"
          name="lookbookSubtitle"
          defaultValue={v("lookbookSubtitle")}
          maxLength={200}
          error={e("lookbookSubtitle")}
        />
      </Section>

      <Section title="A note from Krishna" intro="Shown on the home page. A blank line starts a new paragraph. A draft until she confirms it.">
        <div className="flex gap-4 text-sm" role="tablist">
          <button type="button" role="tab" aria-selected={!preview} className={preview ? "link" : "font-medium"} onClick={() => setPreview(false)}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={preview} className={preview ? "font-medium" : "link"} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
        <div hidden={preview} className="space-y-5">
          <TextArea label="Note" name="note" rows={10} value={note} onChange={(ev) => setNote(ev.target.value)} error={e("note")} />
          <Field label="Signed" name="noteSignature" value={signature} onChange={(ev) => setSignature(ev.target.value)} maxLength={60} placeholder="Krishna" error={e("noteSignature")} />
        </div>
        {preview ? (
          <div className="-mx-4 border-y border-sand py-10">
            {note.trim() ? <Letter text={note} signature={signature.trim() || null} id="note-preview" /> : <p className="px-4 text-sm text-espresso-soft">Nothing written yet.</p>}
          </div>
        ) : null}
      </Section>

      <Section title="Ask Krishna" intro="Powers “Ask about the fit” on every piece.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="WhatsApp number"
            name="supportWhatsapp"
            inputMode="tel"
            defaultValue={v("supportWhatsapp")}
            placeholder="919812345678"
            error={e("supportWhatsapp")}
            hint="With the country code, no +."
          />
          <Field label="Who answers" name="conciergeName" defaultValue={v("conciergeName")} placeholder="Krishna" maxLength={40} error={e("conciergeName")} />
        </div>
        <Field label="Support email" name="supportEmail" type="email" defaultValue={v("supportEmail")} error={e("supportEmail")} />
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-sand bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-4 px-4 py-3">
          <Link href="/" target="_blank" className="link text-sm">
            View the site
          </Link>
          <div className="w-40">
            <SubmitButton pending={pending}>Save</SubmitButton>
          </div>
        </div>
      </div>
    </form>
  );
}
