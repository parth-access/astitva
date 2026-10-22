"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ACROSS } from "@/lib/transition-types";
import { PASSWORD_MIN } from "@/modules/account/input";
import { customerAuthClient } from "@/modules/auth/customer-client";
import { PasswordInput } from "./password-input";
import { Busy } from "./pending";
import { codeProblem } from "./problems";

const RESEND_AFTER = 30;

/**
 * A code to the email, then the code and a new password, then signed in.
 * Also how an account made with a code or Google gets a password.
 */
export function ForgotPasswordForm({ next }: { next: string }) {
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"send" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (step === "reset") codeRef.current?.focus();
  }, [step]);


  async function send() {
    setError(null);
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError("Your email address, please.");
    setBusy("send");
    const { error } = await customerAuthClient.emailOtp.sendVerificationOtp({ email: address, type: "forget-password" });
    setBusy(null);
    if (error) return setError(codeProblem(error));
    setEmail(address);
    setStep("reset");
    setWait(RESEND_AFTER);
  }

  async function reset() {
    setError(null);
    if (code.length !== 6) return setError("The 6-digit code from the email, please.");
    if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters for your new password.`);
    setBusy("reset");
    const { error } = await customerAuthClient.emailOtp.resetPassword({ email, otp: code, password });
    if (error) {
      setBusy(null);
      return setError(codeProblem(error));
    }
    const signedIn = await customerAuthClient.signIn.email({ email, password });
    if (signedIn.error) {
      setBusy(null);
      return setError("Your password is set. Please sign in with it.");
    }
    // A full page load, as after signing in (see sign-in-form.tsx).
    window.location.replace(next);
  }

  const query = next === "/account" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-xl border-l-4 border-burgundy bg-champagne px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {step === "email" ? (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field mt-1.5"
              placeholder="you@example.com"
            />
            <span className="mt-1.5 block text-xs text-espresso-soft">The email on your account. We&apos;ll send a 6-digit code.</span>
          </label>
          <button type="submit" className="btn-primary w-full" disabled={busy !== null}>
            <Busy busy={busy === "send"} busyLabel="Sending…">
              Email me a code
            </Busy>
          </button>
        </form>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void reset();
          }}
        >
          <p className="leading-relaxed">
            If there&apos;s an account with <span className="font-medium">{email}</span>, a code is on its way. It works for 10 minutes.
          </p>
          <label className="block">
            <span className="text-sm font-medium">6-digit code</span>
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="field mt-1.5 text-center text-2xl tracking-[0.5em] tabular-nums"
              placeholder="······"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">New password</span>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" minLength={PASSWORD_MIN} />
            <span className="mt-1 block text-xs text-espresso-soft">At least {PASSWORD_MIN} characters. You&apos;ll be signed out everywhere else.</span>
          </label>
          <button type="submit" className="btn-primary w-full" disabled={busy !== null}>
            <Busy busy={busy === "reset"} busyLabel="Saving…">
              Set password and sign in
            </Busy>
          </button>
          <div className="flex flex-wrap justify-between gap-3 text-sm text-espresso-soft">
            <button type="button" className="link disabled:no-underline disabled:opacity-60" disabled={busy !== null || wait > 0} onClick={() => void send()}>
              <Busy busy={busy === "send"} busyLabel="Sending…">
                {wait > 0 ? `Send it again in ${wait}s` : "Send it again"}
              </Busy>
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              Use another email
            </button>
          </div>
        </form>
      )}

      <p className="border-t border-taupe/40 pt-6 text-center text-sm text-espresso-soft">
        Remembered it?{" "}
        <Link href={`/account/sign-in${query}`} transitionTypes={ACROSS} className="link text-espresso">
          Sign in
        </Link>
      </p>
    </div>
  );
}
