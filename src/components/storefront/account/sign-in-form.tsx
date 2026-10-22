"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { customerAuthClient } from "@/modules/auth/customer-client";

type Problem = { code?: string; message?: string; status?: number } | null | undefined;

/** Better Auth's answers, in the shop's words. */
function say(error: Problem): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code === "ADMIN_ACCOUNT") return "This email is for the Astitva admin. To shop, use another email.";
  if (error.status === 429) return error.message && !/too many requests/i.test(error.message) ? error.message : "That's a few tries in a short time. Please wait a few minutes.";
  switch (error.code) {
    case "INVALID_OTP":
      return "That code isn't right. Check the latest email from us and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Ask for a new one below.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong codes. Ask for a new one below.";
    case "INVALID_EMAIL":
      return "That doesn't look like an email address.";
    default:
      return "Something went wrong. Please try again.";
  }
}

const RESEND_AFTER = 30;

/**
 * Email in, a 6-digit code out, then the code in. No password. Or Google,
 * when it's set up. Signing in for the first time makes the account.
 */
export function SignInForm({ next, google, notice }: { next: string; google: boolean; notice: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode() {
    setError(null);
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Your email address, please.");
      return;
    }
    setBusy(true);
    const { error } = await customerAuthClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    setBusy(false);
    if (error) {
      setError(say(error));
      return;
    }
    setEmail(address);
    setCode("");
    setStep("code");
    setWait(RESEND_AFTER);
  }

  async function checkCode(otp: string) {
    if (busy) return;
    setError(null);
    setBusy(true);
    const { error } = await customerAuthClient.signIn.emailOtp({ email, otp });
    if (error) {
      setBusy(false);
      setError(say(error));
      setCode("");
      codeRef.current?.focus();
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function withGoogle() {
    setError(null);
    setBusy(true);
    const { error } = await customerAuthClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/account/sign-in" });
    if (error) {
      setBusy(false);
      setError(say(error));
    }
  }

  return (
    <div className="space-y-6">
      {notice && !error ? (
        <p role="status" className="rounded-xl bg-champagne px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}
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
            void sendCode();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="send"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field mt-1.5"
              placeholder="you@example.com"
            />
            <span className="mt-1.5 block text-xs text-espresso-soft">We&apos;ll email you a 6-digit code. No password to remember.</span>
          </label>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void checkCode(code);
          }}
        >
          <p className="leading-relaxed">
            We&apos;ve sent a code to <span className="font-medium">{email}</span>. It works for 10 minutes.
          </p>
          <label className="block">
            <span className="text-sm font-medium">6-digit code</span>
            <input
              ref={codeRef}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="done"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(digits);
                // A full code (typed, pasted or filled in from the email) signs in straight away.
                if (digits.length === 6) void checkCode(digits);
              }}
              className="field mt-1.5 text-center text-2xl tracking-[0.5em] tabular-nums"
              placeholder="······"
            />
          </label>
          <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex flex-wrap justify-between gap-3 text-sm text-espresso-soft">
            <button type="button" className="link disabled:no-underline disabled:opacity-60" disabled={busy || wait > 0} onClick={() => void sendCode()}>
              {wait > 0 ? `Send it again in ${wait}s` : "Send it again"}
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
          <p className="text-xs text-espresso-soft">Not there? Look in Promotions or Spam.</p>
        </form>
      )}

      {google && step === "email" ? (
        <>
          <div className="flex items-center gap-4 text-xs text-espresso-soft" aria-hidden="true">
            <span className="h-px flex-1 bg-taupe/50" />
            or
            <span className="h-px flex-1 bg-taupe/50" />
          </div>
          <button type="button" className="btn-outline w-full gap-3" disabled={busy} onClick={() => void withGoogle()}>
            <GoogleMark />
            Continue with Google
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Google's "G", as its sign-in guidelines ask. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
