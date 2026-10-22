"use client";

import Link from "next/link";
import { useActionState, type ComponentProps } from "react";
import { signUpAction, type FormState } from "@/app/(store)/account/actions";
import { PASSWORD_MIN } from "@/modules/account/input";
import { ACROSS } from "@/lib/transition-types";
import { PasswordInput } from "./password-input";
import { Busy } from "./pending";

const empty: FormState = { errors: {} };

/** Name, mobile, email and a password. The server checks every field again. */
export function SignUpForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(signUpAction, empty);
  const e = state.errors;
  const v = (k: string) => state.values?.[k];
  const query = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <form action={action} noValidate className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {e.form ? (
        <p role="alert" className="rounded-xl border-l-4 border-burgundy bg-champagne px-4 py-3 text-sm">
          {e.form}
        </p>
      ) : null}
      <Field label="Full name" name="name" autoComplete="name" defaultValue={v("name")} error={e.name} />
      <label className="block">
        <span className="text-sm font-medium">Mobile</span>
        <span className={`field mt-1.5 !flex items-center gap-2 !p-0 focus-within:border-espresso ${e.phone ? "!border-burgundy" : ""}`}>
          <span className="select-none border-r border-taupe/50 py-3 pl-3.5 pr-3 text-espresso-soft" aria-hidden="true">
            +91
          </span>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98123 45678"
            maxLength={14}
            defaultValue={v("phone")}
            aria-invalid={e.phone ? true : undefined}
            className="min-h-12 w-full bg-transparent pr-3.5 tabular-nums outline-none placeholder:text-espresso-soft/50"
          />
        </span>
        {e.phone ? <span className="mt-1 block text-xs text-burgundy">{e.phone}</span> : <span className="mt-1 block text-xs text-espresso-soft">For the courier, filled in at checkout.</span>}
      </label>
      <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={v("email")} error={e.email} />
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <PasswordInput name="password" autoComplete="new-password" minLength={PASSWORD_MIN} aria-invalid={e.password ? true : undefined} />
        {e.password ? (
          <span className="mt-1 block text-xs text-burgundy">{e.password}</span>
        ) : (
          <span className="mt-1 block text-xs text-espresso-soft">At least {PASSWORD_MIN} characters.</span>
        )}
      </label>
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        <Busy busy={pending} busyLabel="Creating your account…">
          Create my account
        </Busy>
      </button>
      <p className="text-center text-xs leading-relaxed text-espresso-soft">
        We&apos;ll ask you to verify your email next. By creating an account you agree to our{" "}
        <Link href="/policies/terms" className="link">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/policies/privacy" className="link">
          privacy policy
        </Link>
        .
      </p>
      <p className="border-t border-taupe/40 pt-6 text-center text-sm text-espresso-soft">
        Already have an account?{" "}
        <Link href={`/account/sign-in${query}`} transitionTypes={ACROSS} className="link text-espresso">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Field({ label, error, ...input }: { label: string; error?: string } & ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input {...input} aria-invalid={error ? true : undefined} className="field mt-1.5" />
      {error ? <span className="mt-1 block text-xs text-burgundy">{error}</span> : null}
    </label>
  );
}
