import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/modules/auth/auth";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  const { user } = await requireAdmin();
  return (
    <div className="max-w-prose">
      <h1 className="font-display text-3xl">Hello, {user.name}</h1>
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
