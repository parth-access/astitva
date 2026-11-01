"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Monogram } from "@/components/storefront/monogram";

/**
 * Written here, not read from the admin's settings: a page can land here because
 * the database can't be reached. Keep it in step with the support email in settings.
 */
const HELP_EMAIL = "shopastitva@gmail.com";

/** What a visitor sees when a page breaks: what to do next, and how to reach us. */
export function ErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Ties what a buyer reports to the line in the server's logs.
  const digest = (error as { digest?: string } | null)?.digest;

  return (
    <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <Monogram className="h-24 w-auto text-gold" />
      <h1 className="mt-8 text-3xl">Something went wrong on our side</h1>
      <p className="mt-4 text-espresso-soft">
        It isn&apos;t anything you did. Please try again. If it keeps happening, write to{" "}
        <a href={`mailto:${HELP_EMAIL}`} className="link">
          {HELP_EMAIL}
        </a>{" "}
        and we&apos;ll help.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
        <button type="button" className="btn-primary" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/" className="link">
          Back to the home page
        </Link>
      </div>
      {digest ? <p className="mt-8 text-xs text-espresso-soft">Reference: {digest}</p> : null}
    </div>
  );
}
