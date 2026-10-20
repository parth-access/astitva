import Link from "next/link";
import { SignOutButton } from "@/components/admin/auth-forms";
import { db } from "@/db/client";
import { requireAdmin } from "@/modules/auth/auth";
import { countOrdersToCheck } from "@/modules/orders/service";

/** Everything inside the admin proper. Pages and server actions still call requireAdmin() themselves. */
export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const { user, role } = await requireAdmin();
  const toConfirm = await countOrdersToCheck(db);
  return (
    <>
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-display text-sm tracking-[0.3em]">
              ASTITVA <span className="tracking-normal text-espresso-soft">admin</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin/orders" className="link">
                Orders
                {toConfirm ? <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-burgundy px-1.5 text-xs text-ivory no-underline">{toConfirm}</span> : null}
              </Link>
              <Link href="/admin/pieces" className="link">
                Pieces
              </Link>
              {role === "owner" ? (
                <Link href="/admin/discounts" className="link">
                  Discounts
                </Link>
              ) : null}
              <Link href="/admin/settings" className="link">
                Lookbook &amp; settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-espresso-soft sm:inline">{user.name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
