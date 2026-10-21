"use client";

import { useActionState } from "react";
import { setPieceStatusAction, type FormState } from "@/app/admin/(panel)/pieces/actions";
import { cardClass, FormError, StatusBadge, SubmitButton } from "./ui";

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
    active: "On the site. Sold-out colours and sizes show as sold out until you add stock.",
    archived: "Hidden from the site.",
  }[status];

  return (
    <div className={`${cardClass} space-y-4 p-5`}>
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
