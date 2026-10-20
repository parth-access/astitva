import Link from "next/link";
import { SignOutButton } from "@/components/admin/auth-forms";
import { requireAdmin } from "@/modules/auth/auth";

/** Everything inside the admin proper. Pages and server actions still call requireAdmin() themselves. */
export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireAdmin();
  return (
    <>
      <header className="border-b border-sand">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-display text-sm tracking-[0.3em]">
              ASTITVA <span className="tracking-normal text-espresso-soft">admin</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin/pieces" className="link">
                Pieces
              </Link>
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
