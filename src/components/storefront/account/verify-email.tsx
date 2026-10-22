"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ACROSS } from "@/lib/transition-types";
import { customerAuthClient } from "@/modules/auth/customer-client";
import { Busy } from "./pending";
import { codeProblem } from "./problems";

/** On the other account pages while the email isn't verified: points to the card in Your details. */
export function VerifyNotice() {
  return (
    <Link
      href="/account/details#verify"
      transitionTypes={ACROSS}
      className="flex items-center gap-3 rounded-2xl border border-burgundy/30 bg-champagne px-4 py-3 text-sm transition-colors hover:border-burgundy"
    >
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-burgundy text-xs font-semibold text-ivory">
        !
      </span>
      <span className="flex-1">
        <span className="font-medium">Needs attention:</span> verify your email, so your orders and receipts find you.
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

const RESEND_AFTER = 30;

/**
 * Your details: "Verify your email" until it's done. A 6-digit code goes to
 * the email; typing it here proves the email is theirs.
 */
export function VerifyEmailCard({ email }: { email: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    setError(null);
    setBusy("send");
    const { error } = await customerAuthClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    setBusy(null);
    if (error) return setError(codeProblem(error));
    setSent(true);
    setCode("");
    setWait(RESEND_AFTER);
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  async function check(otp: string) {
    if (busy) return;
    setError(null);
    setBusy("check");
    const { error } = await customerAuthClient.emailOtp.verifyEmail({ email, otp });
    setBusy(null);
    if (error) {
      setCode("");
      return setError(codeProblem(error));
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <p role="status" className="rounded-2xl bg-champagne px-5 py-4 text-sm">
        Your email is verified. Thank you.
      </p>
    );
  }

  return (
    <section id="verify" aria-labelledby="verify-h" className="scroll-mt-8 rounded-2xl border border-burgundy/40 bg-champagne p-5 shadow-[0_12px_30px_-20px_rgb(106_29_43/0.6)] sm:p-6">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-burgundy">
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-burgundy text-[0.65rem] text-ivory">
          !
        </span>
        Needs attention
      </p>
      <h2 id="verify-h" className="mt-2 font-display text-2xl italic">
        Verify your email
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-espresso-soft">
        We&apos;ll send a 6-digit code to <span className="text-espresso">{email}</span>. Once it&apos;s verified, orders you placed with it show in your account, and you can
        reset your password if you forget it.
      </p>

      {error ? (
        <p role="alert" className="mt-4 border-l-2 border-burgundy bg-ivory px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {sent ? (
        <form
          className="mt-5 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void check(code);
          }}
        >
          <label className="block max-w-xs">
            <span className="text-sm">6-digit code</span>
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(digits);
                if (digits.length === 6) void check(digits);
              }}
              className="field mt-1.5 bg-ivory text-center text-2xl tracking-[0.5em] tabular-nums"
              placeholder="······"
            />
          </label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <button type="submit" className="btn-primary" disabled={busy !== null || code.length !== 6}>
              <Busy busy={busy === "check"} busyLabel="Checking…">
                Verify
              </Busy>
            </button>
            <button type="button" className="link text-sm disabled:no-underline disabled:opacity-60" disabled={busy !== null || wait > 0} onClick={() => void send()}>
              <Busy busy={busy === "send"} busyLabel="Sending…">
                {wait > 0 ? `Send it again in ${wait}s` : "Send it again"}
              </Busy>
            </button>
          </div>
          <p className="text-xs text-espresso-soft">Not there? Look in Promotions or Spam.</p>
        </form>
      ) : (
        <button type="button" className="btn-primary mt-5" disabled={busy !== null} onClick={() => void send()}>
          <Busy busy={busy === "send"} busyLabel="Sending…">
            Email me a code
          </Busy>
        </button>
      )}
    </section>
  );
}
