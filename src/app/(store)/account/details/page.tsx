import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/brand/reveal";
import { AccountShell, AccountSkeleton } from "@/components/storefront/account/account-shell";
import { DeleteAccount, DetailsForm } from "@/components/storefront/account/details-forms";
import { db } from "@/db/client";
import { formatMobile } from "@/lib/india";
import { getDetails } from "@/modules/account/service";
import { requireCustomer } from "@/modules/auth/customer";
import { signOutEverywhereAction } from "../actions";

export const metadata: Metadata = { title: "Your details", robots: { index: false } };

async function Details() {
  const { id } = await requireCustomer("/account/details");
  const details = await getDetails(db, id);
  if (!details) notFound();

  return (
    <div className="space-y-12">
      <section aria-labelledby="you-h" className="space-y-5">
        <h2 id="you-h" className="caption text-2xl">
          You
        </h2>
        <div>
          <p className="text-sm">Email</p>
          <p className="mt-1.5 break-all text-lg">{details.email}</p>
          <p className="mt-1 text-xs text-espresso-soft">You sign in with this. To change it, message us.</p>
        </div>
        <DetailsForm name={details.name} phone={details.phone ? formatMobile(details.phone) : ""} />
      </section>

      <section aria-labelledby="devices-h" className="space-y-3 border-t border-taupe/40 pt-10">
        <h2 id="devices-h" className="caption text-2xl">
          Signed in
        </h2>
        <p className="text-sm leading-relaxed text-espresso-soft">Lost a phone, or signed in on someone else&apos;s computer? Sign out everywhere, then sign in again here.</p>
        <form action={signOutEverywhereAction}>
          <button type="submit" className="btn-outline">
            Sign out on every device
          </button>
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

export default function DetailsPage() {
  return (
    <AccountShell current="details">
      <Reveal fallback={<AccountSkeleton />}>
        <Details />
      </Reveal>
    </AccountShell>
  );
}
