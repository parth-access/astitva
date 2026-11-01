import type { DbOrTx } from "@/db/create";
import { auditLogs } from "@/db/schema";

type Entry = {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
};

/**
 * A line in the activity log for something that isn't part of a transaction
 * already (a sign-in, a bag change, a job's run). It must never break what it
 * records, so a failure here is only reported to the server's log. No IP
 * addresses or browser details are kept.
 */
export async function logActivity(db: DbOrTx, entry: Entry): Promise<void> {
  try {
    await db.insert(auditLogs).values({ ...entry, actorId: entry.actorId ?? null });
  } catch (err) {
    console.error(`Logging ${entry.action}`, (err as Error).message);
  }
}
