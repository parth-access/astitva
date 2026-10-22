import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/brand/reveal";
import { AccountShell, AccountSkeleton } from "@/components/storefront/account/account-shell";
import Link from "next/link";
import { DeleteAccount, DetailsForm } from "@/components/storefront/account/details-forms";
import { SubmitButton } from "@/components/storefront/account/pending";
import { VerifyEmailCard } from "@/components/storefront/account/verify-email";
import { ACROSS } from "@/lib/transition-types";
import { db } from "@/db/client";
import { formatMobile } from "@/lib/india";
import { getDetails } from "@/modules/account/service";
import { requireCustomer } from "@/modules/auth/customer";
import { signOutEverywhereAction } from "../actions";

export const metadata: Metadata = { title: "Your details", robots: { index: false } };

async function Details({ searchParams }: { searchParams: PageProps<"/account/details">["searchParams"] }) {
  const [{ id, emailVerified }, params] = await Promise.all([requireCustomer("/account/details"), searchParams]);
  const details = await getDetails(db, id);
  if (!details) notFound();

  return (
    <div className="space-y-12">
      {params.welcome && !emailVerified ? (
        <p role="status" className="text-lg leading-relaxed">
          Welcome to Astitva{details.name ? `, ${details.name.split(/\s+/)[0]}` : ""}. One last thing:
        </p>
      ) : null}
      {emailVerified ? null : <VerifyEmailCard email={details.email} />}

      <section aria-labelledby="you-h" className="space-y-5">
        <h2 id="you-h" className="caption text-2xl">
          You
        </h2>
        <div>
          <p className="text-sm">Email</p>
          <p className="mt-1.5 break-all text-lg">{details.email}</p>
          <p className="mt-1 text-xs text-espresso-soft">
            {emailVerified ? "Verified. " : "Not verified yet. "}You sign in with this. To change it, message us.
          </p>
        </div>
        <DetailsForm name={details.name} phone={details.phone ? formatMobile(details.phone) : ""} />
      </section>

      <section aria-labelledby="password-h" className="space-y-3 border-t border-taupe/40 pt-10">
        <h2 id="password-h" className="caption text-2xl">
          Password
        </h2>
        <p className="text-sm leading-relaxed text-espresso-soft">
          To change your password, or set one if you signed up with a code or Google, we&apos;ll email you a code.
        </p>
        <Link href="/account/forgot-password?next=%2Faccount%2Fdetails" transitionTypes={ACROSS} className="btn-outline">
          Change password
        </Link>
      </section>

      <section aria-labelledby="devices-h" className="space-y-3 border-t border-taupe/40 pt-10">
        <h2 id="devices-h" className="caption text-2xl">
          Signed in
        </h2>
        <p className="text-sm leading-relaxed text-espresso-soft">Lost a phone, or signed in on someone else&apos;s computer? Sign out everywhere, then sign in again here.</p>
        <form action={signOutEverywhereAction}>
          <SubmitButton className="btn-outline" pending="Signing out everywhere…">
            Sign out on every device
          </SubmitButton>
        </form>
      </section>

      <section aria-labelledby="delete-h" className="space-y-3 border-t border-taupe/40 pt-10">
        <h2 id="delete-h" className="caption text-2xl">
          Delete your account
        </h2>
        <DeleteAccount />
      </section>
    </div>
  );
}

export default function DetailsPage({ searchParams }: PageProps<"/account/details">) {
  return (
    <AccountShell current="details">
      <Reveal fallback={<AccountSkeleton />}>
        <Details searchParams={searchParams} />
      </Reveal>
    </AccountShell>
  );
}
