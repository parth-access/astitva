"use client";

import { useActionState } from "react";
import { changeStockAction, setPieceStatusAction, type FormState } from "@/app/admin/(panel)/pieces/actions";
import { Field, FormError, Notice, Select, StatusBadge, SubmitButton } from "./ui";

const empty: FormState = { errors: {} };

type Status = "draft" | "active" | "archived";

/** Publish, hide or restore. The server checks the move against productMachine. */
export function StatusPanel({
  productId,
  status,
  slug,
  problems,
}: {
  productId: string;
  status: Status;
  slug: string;
  /** What's missing before the piece can be published. */
  problems: string[];
}) {
  const [state, action, pending] = useActionState(setPieceStatusAction.bind(null, productId), empty);
  const to = status === "active" ? "archived" : "active";
  const label = { draft: "Publish", active: "Hide from the site", archived: "Put back on the site" }[status];
  const explain = {
    draft: "Not on the site yet. Publishing fixes its number and web address for good.",
    active: "On the site. If it sells, it stays visible in the archive.",
    archived: "Hidden from the site, including the archive.",
  }[status];

  return (
    <div className="space-y-4 border border-sand p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg">Status</h2>
        <StatusBadge status={status} />
      </div>
      <p className="text-sm text-espresso-soft">{explain}</p>
      {status === "active" ? (
        <a href={`/pieces/${slug}`} target="_blank" rel="noreferrer" className="link text-sm">
          View on the site
        </a>
      ) : null}
      {status === "draft" && problems.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <FormError message={state.errors.form ?? null} />
      <form action={action}>
        <input type="hidden" name="to" value={to} />
        {status === "active" ? (
          <button type="submit" className="btn-outline w-full" disabled={pending}>
            {pending ? "One moment…" : label}
          </button>
        ) : (
          <SubmitButton pending={pending || (status === "draft" && problems.length > 0)}>{label}</SubmitButton>
        )}
      </form>
    </div>
  );
}

/** Stock changes for one size, each recorded as an inventory movement with a reason. */
export function StockPanel({
  productId,
  variants,
}: {
  productId: string;
  variants: { id: string; label: string; onHand: number }[];
}) {
  const [state, action, pending] = useActionState(changeStockAction.bind(null, productId), empty);
  const v = (k: string) => state.values?.[k] ?? "";
  if (variants.length === 0) return null;

  return (
    <div className="space-y-4 border border-sand p-4">
      <h2 className="font-display text-lg">Stock</h2>
      <ul className="space-y-1 text-sm">
        {variants.map((x) => (
          <li key={x.id} className="flex justify-between">
            <span>{x.label}</span>
            <span>{x.onHand} in stock</span>
          </li>
        ))}
      </ul>
      {state.savedAt && !Object.keys(state.errors).length ? <Notice>Stock updated.</Notice> : null}
      <FormError message={state.errors.form ?? null} />
      <form action={action} className="space-y-4">
        {variants.length > 1 ? (
          <Select label="Size" name="variantId" defaultValue={v("variantId")} error={state.errors.variantId}>
            {variants.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        ) : (
          <input type="hidden" name="variantId" value={variants[0]!.id} />
        )}
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <Select label="Change" name="kind" defaultValue={v("kind") || "receipt"} error={state.errors.kind}>
            <option value="receipt">More arrived</option>
            <option value="adjustment_up">Count was low</option>
            <option value="adjustment_down">Count was high</option>
            <option value="damage">Damaged or lost</option>
          </Select>
          <Field label="How many" name="quantity" inputMode="numeric" defaultValue={v("quantity") || "1"} error={state.errors.quantity} />
        </div>
        <Field label="Why" name="reason" defaultValue={v("reason")} placeholder="Found a second one" error={state.errors.reason} />
        <button type="submit" className="btn-outline w-full" disabled={pending}>
          {pending ? "One moment…" : "Change stock"}
        </button>
      </form>
    </div>
  );
}
