"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { PASSWORD_MIN_LENGTH } from "@/modules/auth/constants";
import { authClient, authErrorMessage } from "@/modules/auth/client";
import { Field, FormError, Notice, SubmitButton } from "./ui";

/**
 * The sign-in forms. They talk to /api/auth from the browser (see
 * modules/auth/client.ts for why) and leave every access decision to the
 * server: after each step they navigate, and requireAdmin() decides.
 */

function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(e: FormEvent<HTMLFormElement>, fn: (form: FormData) => Promise<void>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await fn(new FormData(e.currentTarget));
    } catch (err) {
      setError(err instanceof Error ? err.message : authErrorMessage(null));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, run };
}

function check<T>(result: { data: T | null; error: { code?: string; message?: string; status?: number } | null }): T {
  if (result.error || !result.data) throw new Error(authErrorMessage(result.error));
  return result.data;
}

export function LoginForm() {
  const router = useRouter();
  const { pending, error, run } = useSubmit();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) =>
        run(e, async (form) => {
          const data = check(
            await authClient.signIn.email({
              email: String(form.get("email")),
              password: String(form.get("password")),
            }),
          );
          // With 2FA on, no session exists yet: the code comes next.
          router.push("twoFactorRedirect" in data && data.twoFactorRedirect ? "/admin/verify" : "/admin");
          router.refresh();
        })
      }
    >
      <FormError message={error} />
      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/admin/forgot-password" className="link">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

export function VerifyForm() {
  const router = useRouter();
  const [useBackup, setUseBackup] = useState(false);
  const { pending, error, setError, run } = useSubmit();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) =>
        run(e, async (form) => {
          const code = String(form.get("code")).replace(/\s/g, "");
          const trustDevice = form.get("trust") === "on";
          check(
            useBackup
              ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
              : await authClient.twoFactor.verifyTotp({ code, trustDevice }),
          );
          router.push("/admin");
          router.refresh();
        })
      }
    >
      <FormError message={error} />
      {useBackup ? (
        <Field
          key="backup"
          label="Backup code"
          name="code"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          hint="One of the codes you saved when you set up sign-in. Each works once."
        />
      ) : (
        <Field
          key="totp"
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          hint="From your authenticator app."
        />
      )}
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="trust" defaultChecked className="size-4 accent-burgundy" />
        Trust this device for 30 days
      </label>
      <SubmitButton pending={pending}>Continue</SubmitButton>
      <p className="text-center text-sm">
        <button
          type="button"
          className="link"
          onClick={() => {
            setUseBackup(!useBackup);
            setError(null);
          }}
        >
          {useBackup ? "Use the authenticator app instead" : "Lost your phone? Use a backup code"}
        </button>
      </p>
    </form>
  );
}

type Enrolment = { qrSvg: string; secret: string; backupCodes: string[] };

export function SetupTwoFactor() {
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useSubmit();

  if (!enrolment) {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) =>
          run(e, async (form) => {
            const data = check(
              await authClient.twoFactor.enable({ password: String(form.get("password")), method: "totp" }),
            );
            if (data.method !== "totp") throw new Error(authErrorMessage(null));
            const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
            // Drawn here, in the browser: the setup link is a secret and never goes to a QR service.
            const qrSvg = await QRCode.toString(data.totpURI, { type: "svg", margin: 1, color: { dark: "#34251e", light: "#f7f1e7" } });
            setEnrolment({ qrSvg, secret, backupCodes: data.backupCodes });
          })
        }
      >
        <FormError message={error} />
        <Field label="Your password" name="password" type="password" autoComplete="current-password" required autoFocus />
        <SubmitButton pending={pending}>Continue</SubmitButton>
      </form>
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) =>
        run(e, async (form) => {
          // Better Auth trusts a device only from the sign-in challenge, so the
          // next sign-in asks for a code once, with "trust this device" on.
          check(await authClient.twoFactor.verifyTotp({ code: String(form.get("code")).replace(/\s/g, "") }));
          router.push("/admin");
          router.refresh();
        })
      }
    >
      <section>
        <h2 className="font-medium">1. Scan this with your authenticator app</h2>
        <p className="mt-1 text-sm text-espresso-soft">Google Authenticator, Microsoft Authenticator or 1Password all work.</p>
        <div
          className="mx-auto mt-4 w-52 border border-sand bg-ivory p-2"
          role="img"
          aria-label="QR code for your authenticator app"
          dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }}
        />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-espresso-soft">Can&apos;t scan? Type this key instead</summary>
          <code className="mt-2 block break-all bg-champagne px-3 py-2 font-mono text-sm">{enrolment.secret}</code>
        </details>
      </section>

      <section>
        <h2 className="font-medium">2. Save your backup codes</h2>
        <p className="mt-1 text-sm text-espresso-soft">
          If you lose your phone, each of these lets you in once. Keep them somewhere safe, away from this phone (a
          password manager, or printed).
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 bg-champagne p-3 font-mono text-sm">
          {enrolment.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          type="button"
          className="link mt-2 text-sm"
          onClick={() => navigator.clipboard?.writeText(enrolment.backupCodes.join("\n"))}
        >
          Copy codes
        </button>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4 accent-burgundy" />
          I&apos;ve saved my backup codes
        </label>
      </section>

      <section className="space-y-5">
        <h2 className="font-medium">3. Enter the code your app shows</h2>
        <FormError message={error} />
        <Field
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
        />
        <SubmitButton pending={pending || !saved}>Turn on and continue</SubmitButton>
      </section>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useSubmit();
  if (sent) {
    return (
      <Notice>
        If that email belongs to an admin, a link to set a new password is on its way. It works for one hour.
      </Notice>
    );
  }
  return (
    <form
      className="space-y-5"
      onSubmit={(e) =>
        run(e, async (form) => {
          check(
            await authClient.requestPasswordReset({
              email: String(form.get("email")),
              redirectTo: `${window.location.origin}/admin/reset-password`,
            }),
          );
          setSent(true);
        })
      }
    >
      <FormError message={error} />
      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <SubmitButton pending={pending}>Send me a link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const { pending, error, run } = useSubmit();
  if (done) {
    return (
      <div className="space-y-5">
        <Notice>Your password is set.</Notice>
        <Link href="/admin/login" className="btn-primary w-full">
          Sign in
        </Link>
      </div>
    );
  }
  return (
    <form
      className="space-y-5"
      onSubmit={(e) =>
        run(e, async (form) => {
          const newPassword = String(form.get("password"));
          if (newPassword !== String(form.get("confirm"))) throw new Error("The two passwords don't match.");
          check(await authClient.resetPassword({ newPassword, token }));
          setDone(true);
        })
      }
    >
      <FormError message={error} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
        autoFocus
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember and hard to guess.`}
      />
      <Field label="Type it again" name="confirm" type="password" autoComplete="new-password" required />
      <SubmitButton pending={pending}>Set password</SubmitButton>
    </form>
  );
}

export function SignOutButton({ className = "link text-sm" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await authClient.signOut();
        router.push("/admin/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
