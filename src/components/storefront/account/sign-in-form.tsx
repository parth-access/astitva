"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ACROSS } from "@/lib/transition-types";
import { customerAuthClient } from "@/modules/auth/customer-client";
import { PasswordInput } from "./password-input";
import { Busy } from "./pending";
import { codeProblem } from "./problems";

const RESEND_AFTER = 30;
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

type Mode = "password" | "code";

/**
 * Three ways in: email and password, a 6-digit code by email (no password
 * needed, and it makes the account if there isn't one), or Google when it's
 * set up.
 */
export function SignInForm({ next, google, notice }: { next: string; google: boolean; notice: string | null }) {
  const [mode, setMode] = useState<Mode>("password");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"password" | "send" | "check" | "google" | null>(null);
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


  // A full page load: anything the browser kept from before signing in (like
  // "/account sends you to sign in") would otherwise send you round in a loop.
  function done() {
    window.location.replace(next);
  }

  function switchTo(m: Mode) {
    setMode(m);
    setStep("email");
    setError(null);
  }

  async function withPassword() {
    setError(null);
    const address = email.trim().toLowerCase();
    if (!looksLikeEmail(address)) return setError("Your email address, please.");
    if (!password) return setError("Your password, please.");
    setBusy("password");
    const { error } = await customerAuthClient.signIn.email({ email: address, password });
    if (error) {
      setBusy(null);
      return setError(codeProblem(error));
    }
    done();
  }

  async function sendCode() {
    setError(null);
    const address = email.trim().toLowerCase();
    if (!looksLikeEmail(address)) return setError("Your email address, please.");
    setBusy("send");
    const { error } = await customerAuthClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    setBusy(null);
    if (error) return setError(codeProblem(error));
    setEmail(address);
    setCode("");
    setStep("code");
    setWait(RESEND_AFTER);
  }

  async function checkCode(otp: string) {
    if (busy) return;
    setError(null);
    setBusy("check");
    const { error } = await customerAuthClient.signIn.emailOtp({ email, otp });
    if (error) {
      setBusy(null);
      setCode("");
      codeRef.current?.focus();
      return setError(codeProblem(error));
    }
    done();
  }

  async function withGoogle() {
    setError(null);
    setBusy("google");
    const { error } = await customerAuthClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/account/sign-in" });
    if (error) {
      setBusy(null);
      setError(codeProblem(error));
    }
  }

  const query = next === "/account" ? "" : `?next=${encodeURIComponent(next)}`;

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

      <div role="tablist" aria-label="How to sign in" className="grid grid-cols-2 rounded-full border border-taupe/50 p-1 text-sm">
        {(
          [
            ["password", "Password"],
            ["code", "Email me a code"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchTo(m)}
            className={`rounded-full px-3 py-2 transition-colors ${mode === m ? "bg-espresso text-ivory" : "text-espresso-soft hover:text-espresso"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void withPassword();
          }}
        >
          <EmailField value={email} onChange={setEmail} />
          <label className="block">
            <span className="flex items-baseline justify-between text-sm font-medium">
              Password
              <Link href={`/account/forgot-password${query}`} transitionTypes={ACROSS} className="link text-xs font-normal text-espresso-soft">
                Forgot it?
              </Link>
            </span>
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
          </label>
          <button type="submit" className="btn-primary w-full" disabled={busy !== null}>
            <Busy busy={busy === "password"} busyLabel="Signing in…">
              Sign in
            </Busy>
          </button>
        </form>
      ) : step === "email" ? (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <EmailField value={email} onChange={setEmail} hint="We'll email you a 6-digit code. No password needed; new here, and it makes your account." />
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
          <button type="submit" className="btn-primary w-full" disabled={busy !== null || code.length !== 6}>
            <Busy busy={busy === "check"} busyLabel="Signing in…">
              Sign in
            </Busy>
          </button>
          <div className="flex flex-wrap justify-between gap-3 text-sm text-espresso-soft">
            <button type="button" className="link disabled:no-underline disabled:opacity-60" disabled={busy !== null || wait > 0} onClick={() => void sendCode()}>
              <Busy busy={busy === "send"} busyLabel="Sending…">
                {wait > 0 ? `Send it again in ${wait}s` : "Send it again"}
              </Busy>
            </button>
            <button type="button" className="link" onClick={() => switchTo("code")}>
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
          <button type="button" className="btn-outline w-full gap-3" disabled={busy !== null} onClick={() => void withGoogle()}>
            <Busy busy={busy === "google"} busyLabel="Opening Google…">
              <GoogleMark />
              Continue with Google
            </Busy>
          </button>
        </>
      ) : null}

      <p className="border-t border-taupe/40 pt-6 text-center text-sm text-espresso-soft">
        New here?{" "}
        <Link href={`/account/sign-up${query}`} transitionTypes={ACROSS} className="link text-espresso">
          Create an account
        </Link>
      </p>
    </div>
  );
}

function EmailField({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">Email</span>
      <input
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field mt-1.5"
        placeholder="you@example.com"
      />
      {hint ? <span className="mt-1.5 block text-xs text-espresso-soft">{hint}</span> : null}
    </label>
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
