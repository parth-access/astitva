"use client";

import { useActionState, useEffect, useRef, type ComponentProps } from "react";
import { saveAddressAction, type FormState } from "@/app/(store)/account/actions";
import { INDIAN_STATES } from "@/lib/india";
import { Busy } from "./pending";

export type AddressValues = {
  id?: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

const empty: FormState = { errors: {} };

/**
 * Adds an address, or changes one, inside a disclosure that closes once it's
 * saved. The server checks every field again.
 */
export function AddressEditor({ address, summary, open = false }: { address?: AddressValues; summary: string; open?: boolean }) {
  const [state, action, pending] = useActionState(saveAddressAction, empty);
  const ref = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.saved) return;
    if (ref.current) ref.current.open = false;
    if (!address) formRef.current?.reset();
  }, [state.saved, address]);

  const e = (k: string) => state.errors[k];
  const v = (k: keyof AddressValues) => state.values?.[k] ?? (address ? String(address[k] ?? "") : "");
  const id = address?.id ?? "new";

  return (
    <details ref={ref} open={open} className={address ? "group open:order-last open:basis-full" : "group"}>
      <summary className={address ? "link cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden" : "btn-outline cursor-pointer list-none [&::-webkit-details-marker]:hidden"}>
        {summary}
      </summary>
      <form ref={formRef} action={action} noValidate className="mt-5 space-y-5 rounded-2xl border border-taupe/40 bg-ivory p-5 sm:p-6">
        {address?.id ? <input type="hidden" name="id" value={address.id} /> : null}
        {e("form") ? (
          <p role="alert" className="border-l-2 border-burgundy bg-champagne px-4 py-3 text-sm">
            {e("form")}
          </p>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" name="name" autoComplete="name" defaultValue={v("name")} error={e("name")} />
          <Field label="Mobile" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98123 45678" defaultValue={v("phone")} error={e("phone")} />
        </div>
        <Field label="House or flat, street" name="line1" autoComplete="address-line1" defaultValue={v("line1")} error={e("line1")} />
        <Field label="Area or locality (optional)" name="line2" autoComplete="address-line2" defaultValue={v("line2")} error={e("line2")} />
        <Field label="Landmark (optional)" name="landmark" defaultValue={v("landmark")} error={e("landmark")} />
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Pincode" name="pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} defaultValue={v("pincode")} error={e("pincode")} />
          <Field label="Town or city" name="city" autoComplete="address-level2" defaultValue={v("city")} error={e("city")} />
          <label className="block">
            <span className="text-sm">State</span>
            <select name="state" autoComplete="address-level1" defaultValue={v("state")} aria-invalid={e("state") ? true : undefined} className="field mt-1.5">
              <option value="" disabled>
                Choose
              </option>
              {INDIAN_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {e("state") ? <span className="mt-1 block text-xs text-burgundy">{e("state")}</span> : null}
          </label>
        </div>
        {address?.isDefault ? null : (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="makeDefault" id={`default-${id}`} className="size-4 accent-burgundy" />
            Use this address first at checkout
          </label>
        )}
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
          <Busy busy={pending} busyLabel="Saving…">
            {address ? "Save changes" : "Save address"}
          </Busy>
        </button>
      </form>
    </details>
  );
}

function Field({ label, error, ...input }: { label: string; error?: string } & ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input {...input} aria-invalid={error ? true : undefined} className="field mt-1.5" />
      {error ? <span className="mt-1 block text-xs text-burgundy">{error}</span> : null}
    </label>
  );
}
