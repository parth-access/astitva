/**
 * Sends one email through Resend's HTTP API. Account emails (password reset)
 * call it directly; order emails go through email_outbox and are sent by
 * src/modules/email/outbox.ts, which retries.
 *
 * Without RESEND_API_KEY (local development) the email is printed to the log
 * instead, so links can be followed without a mail provider.
 */
export type Attachment = { filename: string; content: Uint8Array };

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
  /**
   * The same key within 24 hours sends nothing new: Resend answers with the
   * first send. A retry after a timeout (sent, but we never heard) can't send twice.
   */
  idempotencyKey?: string;
};

export type SendEmail = (email: Email) => Promise<void>;

export async function sendEmail(email: Email, env: Partial<Record<string, string>> = process.env): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) {
    if (env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set: cannot send email.");
    const attached = email.attachments?.length ? `\n(attached: ${email.attachments.map((a) => `${a.filename}, ${Math.round(a.content.byteLength / 1024)} KB`).join("; ")})` : "";
    console.info(`[email] to ${email.to}: ${email.subject}\n${email.text}${attached}`);
    return;
  }
  const from = env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(email.idempotencyKey ? { "idempotency-key": email.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.attachments?.length
        ? { attachments: email.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) }
        : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
}
