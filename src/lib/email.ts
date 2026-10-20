/**
 * Sends one email through Resend's HTTP API. Account emails (password reset)
 * call it directly; order emails go through email_outbox and are sent by
 * src/modules/email/outbox.ts, which retries.
 *
 * Without RESEND_API_KEY (local development) the email is printed to the log
 * instead, so links can be followed without a mail provider.
 */
export type Email = { to: string; subject: string; text: string; html?: string };

export type SendEmail = (email: Email) => Promise<void>;

export async function sendEmail(email: Email, env: Partial<Record<string, string>> = process.env): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) {
    if (env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set: cannot send email.");
    console.info(`[email] to ${email.to}: ${email.subject}\n${email.text}`);
    return;
  }
  const from = env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, ...(email.html ? { html: email.html } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
}
