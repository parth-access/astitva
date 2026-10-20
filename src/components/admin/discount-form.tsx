"use client";

import { useActionState, useState, useTransition } from "react";
import { createDiscountAction, setDiscountActiveAction, type DiscountFormState } from "@/app/admin/(panel)/discounts/actions";
import { Field, FormError, Notice, Select, SubmitButton } from "./ui";

const empty: DiscountFormState = { errors: {} };

export function DiscountForm() {
  const [state, action, pending] = useActionState(createDiscountAction, empty);
  const v = (k: string) => state.values?.[k] ?? "";
  const e = (k: string) => state.errors[k];
  const [kind, setKind] = useState(v("kind") || "percent");
  return (
    <form action={action} className="space-y-5" noValidate key={state.created ?? "new"}>
      {state.created ? <Notice>{state.created} is live. Share it as it is; buyers can type it in any case.</Notice> : null}
      {Object.keys(state.errors).length && !state.created ? <FormError message="Please check the fields marked below." /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Code" name="code" defaultValue={v("code")} placeholder="LAUNCH10" error={e("code")} hint="What buyers type." />
        <Field label="Note (only you see it)" name="note" defaultValue={v("note")} placeholder="Instagram launch" maxLength={200} error={e("note")} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Select label="Kind" name="kind" value={kind} onChange={(ev) => setKind(ev.target.value)}>
          <option value="percent">A percentage off</option>
          <option value="amount">Rupees off</option>
        </Select>
        <Field
          label={kind === "percent" ? "Percent off" : "Rupees off"}
          name="value"
          inputMode="decimal"
          defaultValue={v("value")}
          placeholder={kind === "percent" ? "10" : "500"}
          error={e("value")}
          hint="Off the pieces, before shipping."
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Minimum order (₹)" name="minSubtotal" inputMode="decimal" defaultValue={v("minSubtotal")} placeholder="0" error={e("minSubtotal")} />
        <Field label="Starts (optional)" name="startsAt" type="date" defaultValue={v("startsAt")} error={e("startsAt")} />
        <Field label="Ends (optional)" name="endsAt" type="date" defaultValue={v("endsAt")} error={e("endsAt")} hint="Through the end of that day, India time." />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Total uses (optional)" name="maxUses" inputMode="numeric" defaultValue={v("maxUses")} placeholder="No limit" error={e("maxUses")} />
        <label className="flex items-center gap-3 self-end pb-3 text-sm">
          <input type="checkbox" name="onePerPhone" defaultChecked={state.values ? v("onePerPhone") === "on" : true} className="size-4 accent-burgundy" />
          Once per mobile number
        </label>
      </div>
      <div className="w-48">
        <SubmitButton pending={pending}>Create code</SubmitButton>
      </div>
    </form>
  );
}

export function DiscountToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="link text-sm" disabled={pending} onClick={() => start(() => setDiscountActiveAction(id, !isActive))}>
      {pending ? "…" : isActive ? "Switch off" : "Switch on"}
    </button>
  );
}
