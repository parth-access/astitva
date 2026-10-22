"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, saveDetailsAction, type FormState } from "@/app/(store)/account/actions";

const empty: FormState = { errors: {} };

export function DetailsForm({ name, phone }: { name: string; phone: string }) {
  const [state, action, pending] = useActionState(saveDetailsAction, empty);
  const e = state.errors;
  return (
    <form action={action} noValidate className="space-y-5">
      <label className="block">
        <span className="text-sm">Name</span>
        <input name="name" autoComplete="name" defaultValue={state.values?.name ?? name} aria-invalid={e.name ? true : undefined} className="field mt-1.5" />
        {e.name ? <span className="mt-1 block text-xs text-burgundy">{e.name}</span> : null}
      </label>
      <label className="block">
        <span className="text-sm">Mobile (optional)</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98123 45678"
          defaultValue={state.values?.phone ?? phone}
          aria-invalid={e.phone ? true : undefined}
          className="field mt-1.5"
        />
        {e.phone ? <span className="mt-1 block text-xs text-burgundy">{e.phone}</span> : <span className="mt-1 block text-xs text-espresso-soft">Filled in for you at checkout.</span>}
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state.saved && !pending ? (
          <span role="status" className="text-sm text-espresso-soft">
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Two steps, so it can't happen by a slip: open, then type "delete". */
export function DeleteAccount() {
  const [state, action, pending] = useActionState(deleteAccountAction, empty);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="link text-sm text-burgundy" onClick={() => setOpen(true)}>
        Delete my account
      </button>
    );
  }
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-burgundy/40 bg-champagne/60 p-5">
      <p className="text-sm leading-relaxed">
        This deletes your account, saved addresses, saved pieces and back-in-stock alerts, and signs you out everywhere. It can&apos;t be undone. Your orders
        stay with us for tax records, without your account, and their private pages keep working.
      </p>
      <label className="block">
        <span className="text-sm">
          Type <span className="font-medium">delete</span> to confirm
        </span>
        <input name="confirm" autoComplete="off" autoCapitalize="none" className="field mt-1.5" aria-invalid={state.errors.confirm ? true : undefined} />
        {state.errors.confirm ? <span className="mt-1 block text-xs text-burgundy">{state.errors.confirm}</span> : null}
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Deleting…" : "Delete my account"}
        </button>
        <button type="button" className="btn-outline" onClick={() => setOpen(false)}>
          Keep it
        </button>
      </div>
    </form>
  );
}
