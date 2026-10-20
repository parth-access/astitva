import "server-only";
import { after } from "next/server";
import { db } from "@/db/client";
import { sendQueuedEmails } from "@/modules/email/soon";
import { notifyRestocked } from "./service";

/**
 * After a change that may have brought stock back (a piece saved in the editor,
 * an order cancelled or returned), tell whoever was waiting, after the response.
 * The 15-minute job catches anything this misses.
 */
export function notifyRestockedSoon() {
  after(async () => {
    try {
      if ((await notifyRestocked(db)) > 0) await sendQueuedEmails(25);
    } catch (err) {
      console.error("[alerts] back-in-stock check failed; the scheduled job will retry", (err as Error).message);
    }
  });
}
