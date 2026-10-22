import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/storefront/account/forgot-password-form";
import { safeNext } from "@/modules/auth/customer-config";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Forgot({ searchParams }: { searchParams: PageProps<"/account/forgot-password">["searchParams"] }) {
  const params = await searchParams;
  return <ForgotPasswordForm next={safeNext(one(params.next))} />;
}

export default function ForgotPasswordPage({ searchParams }: PageProps<"/account/forgot-password">) {
  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-12 sm:px-8 md:pt-20">
      <p className="caption text-xl">Your account</p>
      <h1 className="mt-2 text-5xl italic md:text-6xl">Set a new password</h1>
      <p className="mt-5 leading-relaxed text-espresso-soft">Forgotten it, or never set one? We&apos;ll email you a code, then you choose a new password.</p>
      <div className="mt-10">
        <Suspense fallback={<div className="skeleton h-40 w-full" aria-busy="true" aria-label="Loading" />}>
          <Forgot searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
