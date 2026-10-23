import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/brand/reveal";
import { AccountShell, AccountSkeleton } from "@/components/storefront/account/account-shell";
import { VerifyNotice } from "@/components/storefront/account/verify-email";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { formatINR } from "@/lib/money";
import { ACROSS, FORWARD } from "@/lib/transition-types";
import { listAccountOrders, type AccountOrder } from "@/modules/account/service";
import { requireCustomer } from "@/modules/auth/customer";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

const STATUS: Record<AccountOrder["status"], string> = {
  pending_payment: "Waiting for payment",
  confirmed: "Being packed",
  packed: "Packed",
  shipped: "On its way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Came back to us",
};

const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

async function Orders() {
  const customer = await requireCustomer("/account");
  const orders = await listAccountOrders(db, { userId: customer.id, email: customer.emailVerified ? customer.email : null }, env().BETTER_AUTH_SECRET);
  const first = customer.name.trim().split(/\s+/)[0];

  return (
    <div className="space-y-8">
      {customer.emailVerified ? null : <VerifyNotice />}
      <p className="leading-relaxed text-espresso-soft">
        {first ? `Hello, ${first}. ` : ""}
        {customer.emailVerified ? (
          <>
            Every order placed with <span className="text-espresso">{customer.email}</span> shows here, including ones from before you had an account.
          </>
        ) : (
          <>Orders you place signed in show here. Verify your email to see ones you placed with it before.</>
        )}
        {first ? null : (
          <>
            {" "}
            <Link href="/account/details" transitionTypes={ACROSS} className="link text-espresso">
              Tell us your name
            </Link>
            .
          </>
        )}
      </p>

      {orders.length === 0 ? (
        <div className="rounded-3xl border border-taupe/40 bg-[rgb(255_252_245/0.7)] px-6 py-12 text-center">
          <p className="font-display text-3xl italic">No orders yet</p>
          <p className="mt-2 text-espresso-soft">When you order, it will be here, a tap away.</p>
          <Link href="/shop" transitionTypes={ACROSS} className="btn-outline mt-6">
            Browse the pieces
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.number}>
              <Link
                href={o.href}
                transitionTypes={FORWARD}
                className="group flex items-center gap-4 rounded-2xl border border-taupe/40 bg-[rgb(255_252_245/0.7)] px-5 py-4 transition-colors hover:border-espresso"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs tracking-[0.18em] text-espresso-soft tabular-nums">{o.number}</span>
                  <span className="mt-0.5 block truncate font-display text-xl italic">{o.summary}</span>
                  <span className="mt-0.5 block text-sm text-espresso-soft">
                    {day.format(o.placedAt)} · <span className="tabular-nums">{formatINR(o.totalMinor)}</span> · {o.paymentMethod === "cod" ? "Cash on delivery" : "Paid online"}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-champagne px-3 py-1 text-xs">{STATUS[o.status]}</span>
                <span aria-hidden="true" className="text-xl text-espresso-soft transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
              {o.receipt ? (
                <Link href={o.receipt.href} transitionTypes={FORWARD} className="link mt-1.5 inline-block px-5 text-xs text-espresso-soft">
                  Receipt {o.receipt.number}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AccountOrdersPage() {
  return (
    <AccountShell current="orders">
      <Reveal fallback={<AccountSkeleton />}>
        <Orders />
      </Reveal>
    </AccountShell>
  );
}
