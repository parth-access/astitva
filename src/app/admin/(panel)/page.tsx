import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/modules/auth/auth";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  const { user } = await requireAdmin();
  return (
    <div className="max-w-prose">
      <h1 className="font-display text-3xl">Hello, {user.name}</h1>
      <p className="mt-4 text-espresso-soft">
        The piece and chapter editors arrive here next. Until then, this page confirms that sign-in works.
      </p>
      <p className="mt-6 text-sm">
        <Link href="/" className="link">
          View the shop
        </Link>
      </p>
    </div>
  );
}
