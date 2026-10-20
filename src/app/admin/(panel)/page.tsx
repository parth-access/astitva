import type { Metadata } from "next";
import Link from "next/link";
import { FormError } from "@/components/admin/ui";
import { db } from "@/db/client";
import { requireAdmin } from "@/modules/auth/auth";
import { failedEmailCount } from "@/modules/email/outbox";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  const { user } = await requireAdmin();
  const failedEmails = await failedEmailCount(db);
  return (
    <div className="max-w-prose">
      <h1 className="font-display text-3xl">Hello, {user.name}</h1>
      {failedEmails ? (
        <div className="mt-6">
          <FormError
            message={`${failedEmails} ${failedEmails === 1 ? "email" : "emails"} couldn't be sent after six tries. Check Resend's dashboard (the domain and the API key), then tell Parth.`}
          />
        </div>
      ) : null}
      <ul className="mt-8 space-y-3">
        <li>
          <Link href="/admin/orders" className="link text-lg">
            Orders
          </Link>
          <span className="ml-2 text-sm text-espresso-soft">Confirm cash-on-delivery orders with the buyer, or cancel them.</span>
        </li>
        <li>
          <Link href="/admin/pieces" className="link text-lg">
            Pieces
          </Link>
          <span className="ml-2 text-sm text-espresso-soft">Add and edit pieces, photos, prices and stock.</span>
        </li>
        <li>
          <Link href="/admin/settings" className="link text-lg">
            Lookbook &amp; settings
          </Link>
          <span className="ml-2 text-sm text-espresso-soft">The home page&apos;s title and Krishna&apos;s note, ordering, delivery and cash on delivery, WhatsApp.</span>
        </li>
        <li>
          <Link href="/" className="link text-lg">
            View the shop
          </Link>
        </li>
      </ul>
    </div>
  );
}
