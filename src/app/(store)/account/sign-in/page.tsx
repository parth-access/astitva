import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/components/storefront/account/sign-in-form";
import { getCustomer, googleSignIn } from "@/modules/auth/customer";
import { safeNext } from "@/modules/auth/customer-config";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** What the page says on arrival: after signing out everywhere, deleting the account, or a Google sign-in that didn't work. */
function noticeFor(params: Record<string, string | string[] | undefined>): string | null {
  if (one(params.deleted)) return "Your account is deleted. Thank you for shopping with us.";
  if (one(params["signed-out"]) === "everywhere") return "You're signed out on every device.";
  const error = one(params.error);
  if (error === "ADMIN_ACCOUNT" || error?.toLowerCase().includes("admin")) return "That Google account is the Astitva admin's. To shop, use another one.";
  if (error && /not.?linked/i.test(error)) return "There's an account with this email that isn't verified yet. Sign in with your password or an email code, verify your email in Your details, then Google will work too.";
  if (error) return "Signing in with Google didn't work. Try again, or use your email.";
  return null;
}

async function SignIn({ searchParams }: { searchParams: PageProps<"/account/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNext(one(params.next));
  if (await getCustomer()) redirect(next);
  return <SignInForm next={next} google={googleSignIn()} notice={noticeFor(params)} />;
}

export default function SignInPage({ searchParams }: PageProps<"/account/sign-in">) {
  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-12 sm:px-8 md:pt-20">
      <p className="caption text-xl">Your account</p>
      <h1 className="mt-2 text-5xl italic md:text-6xl">Sign in</h1>
      <p className="mt-5 leading-relaxed text-espresso-soft">
        See all your orders in one place and keep your addresses for next time.
      </p>
      <div className="mt-10">
        <Suspense fallback={<div className="skeleton h-40 w-full" aria-busy="true" aria-label="Loading" />}>
          <SignIn searchParams={searchParams} />
        </Suspense>
      </div>
      <p className="mt-10 text-center text-xs text-espresso-soft">You never need an account to order.</p>
    </div>
  );
}
