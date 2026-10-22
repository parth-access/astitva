import type { Metadata } from "next";
import { Reveal } from "@/components/brand/reveal";
import { AccountShell, AccountSkeleton } from "@/components/storefront/account/account-shell";
import { AddressEditor } from "@/components/storefront/account/address-form";
import { db } from "@/db/client";
import { formatMobile } from "@/lib/india";
import { listAddresses, MAX_ADDRESSES } from "@/modules/account/service";
import { requireCustomer } from "@/modules/auth/customer";
import { deleteAddressAction, setDefaultAddressAction } from "../actions";

export const metadata: Metadata = { title: "Your addresses", robots: { index: false } };

async function Addresses() {
  const { id } = await requireCustomer("/account/addresses");
  const addresses = await listAddresses(db, id);

  return (
    <div className="space-y-8">
      <p className="leading-relaxed text-espresso-soft">Saved here, they&apos;re ready at checkout. The one marked first is filled in for you.</p>

      {addresses.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-col rounded-2xl border border-taupe/40 bg-[rgb(255_252_245/0.7)] p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-xl italic">{a.recipientName}</p>
                {a.isDefault ? <span className="shrink-0 rounded-full bg-champagne px-3 py-1 text-xs">Used first</span> : null}
              </div>
              <address className="mt-2 flex-1 text-sm not-italic leading-relaxed text-espresso-soft">
                {a.line1}
                {a.line2 ? <>, {a.line2}</> : null}
                <br />
                {a.landmark ? (
                  <>
                    Near {a.landmark}
                    <br />
                  </>
                ) : null}
                {a.city}, {a.state} {a.pincode}
                <br />
                <span className="tabular-nums">{formatMobile(a.phone)}</span>
              </address>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <AddressEditor
                  summary="Edit"
                  address={{
                    id: a.id,
                    name: a.recipientName,
                    phone: a.phone,
                    line1: a.line1,
                    line2: a.line2 ?? "",
                    landmark: a.landmark ?? "",
                    city: a.city,
                    state: a.state,
                    pincode: a.pincode,
                    isDefault: a.isDefault,
                  }}
                />
                {a.isDefault ? null : (
                  <form action={setDefaultAddressAction.bind(null, a.id)}>
                    <button type="submit" className="link">
                      Use first
                    </button>
                  </form>
                )}
                <form action={deleteAddressAction.bind(null, a.id)}>
                  <button type="submit" className="link text-espresso-soft">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {addresses.length < MAX_ADDRESSES ? (
        <AddressEditor summary={addresses.length ? "Add another address" : "Add an address"} open={addresses.length === 0} />
      ) : (
        <p className="text-sm text-espresso-soft">That&apos;s {MAX_ADDRESSES} addresses, the most we keep. Remove one to add another.</p>
      )}
    </div>
  );
}

export default function AddressesPage() {
  return (
    <AccountShell current="addresses">
      <Reveal fallback={<AccountSkeleton />}>
        <Addresses />
      </Reveal>
    </AccountShell>
  );
}
