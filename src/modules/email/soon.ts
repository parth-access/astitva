import "server-only";
import { after } from "next/server";
import { db } from "@/db/client";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { processOutbox } from "./outbox";

/** The worker as the running site uses it. */
export function sendQueuedEmails(limit = 25) {
  return processOutbox(db, (e) => sendEmail(e), { appUrl: env().APP_URL, linkSecret: env().BETTER_AUTH_SECRET }, { limit });
}

/**
 * Send what was just queued, after the response has gone (the buyer doesn't
 * wait on the mail provider). Anything that fails is retried by the scheduled job.
 */
export function sendQueuedEmailsSoon() {
  after(async () => {
    try {
      await sendQueuedEmails(10);
    } catch (err) {
      console.error("[email] sending after the request failed; the scheduled job will retry", (err as Error).message);
    }
  });
}
