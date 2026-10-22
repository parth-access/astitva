import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignUpForm } from "@/components/storefront/account/sign-up-form";
import { getCustomer } from "@/modules/auth/customer";
import { safeNext } from "@/modules/auth/customer-config";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function SignUp({ searchParams }: { searchParams: PageProps<"/account/sign-up">["searchParams"] }) {
  const params = await searchParams;
  const raw = one(params.next);
  const next = raw ? safeNext(raw) : null;
  if (await getCustomer()) redirect(next ?? "/account");
  return <SignUpForm next={next} />;
}

export default function SignUpPage({ searchParams }: PageProps<"/account/sign-up">) {
  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-12 sm:px-8 md:pt-20">
      <p className="caption text-xl">Your account</p>
      <h1 className="mt-2 text-5xl italic md:text-6xl">Create an account</h1>
      <p className="mt-5 leading-relaxed text-espresso-soft">Your orders in one place, and your details filled in for you next time.</p>
      <div className="mt-10">
        <Suspense fallback={<div className="skeleton h-96 w-full" aria-busy="true" aria-label="Loading" />}>
          <SignUp searchParams={searchParams} />
        </Suspense>
      </div>
      <p className="mt-10 text-center text-xs text-espresso-soft">You never need an account to order.</p>
    </div>
  );
}
