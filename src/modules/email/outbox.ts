/**
 * The email queue (email_outbox). Anything that should send an email writes a
 * row in the same transaction as the change it reports, so an email is never
 * lost or sent for a change that rolled back. The worker sends them:
 *
 * - right after the request that queued them (via `after()`, see ./soon.ts)
 * - and every 15 minutes from the scheduled job, for anything that failed.
 *
 * Each row is claimed with a short lease before sending, so two workers never
 * send the same email. Failures back off (1, 5, 30 min, 2, 6 h) and give up
 * after 6 tries; given-up emails show on the admin home page.
 */
import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/create";
import { adminRoleAssignments, emailOutbox, users } from "@/db/schema";
import type { SendEmail } from "@/lib/email";
import { renderEmail, type RenderContext, type TemplateName } from "./templates";

export const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const LEASE_MINUTES = 10;

export async function queueEmail(db: DbOrTx, input: { dedupeKey: string; template: TemplateName; to: string; payload: Record<string, unknown> }) {
  await db
    .insert(emailOutbox)
    .values({ dedupeKey: input.dedupeKey.slice(0, 160), template: input.template, toAddress: input.to, payload: input.payload })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey });
}

/** Email addresses of the owners (Krishna and Parth), who get the shop's alerts. */
export async function ownerEmails(db: DbOrTx): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(adminRoleAssignments)
    .innerJoin(users, eq(users.id, adminRoleAssignments.userId))
    .where(eq(adminRoleAssignments.role, "owner"));
  return rows.map((r) => r.email).filter((e): e is string => Boolean(e));
}

/** Tell every owner. `key` makes it once per event (e.g. the order id). */
export async function alertOwners(db: DbOrTx, template: "owner_new_order" | "owner_needs_you" | "owner_error", key: string, payload: Record<string, unknown>) {
  for (const to of await ownerEmails(db)) {
    await queueEmail(db, { dedupeKey: `${template}:${key}:${to}`, template, to, payload });
  }
}

/**
 * Something failed that a person should look at. At most one email per kind
 * of failure per hour, so a broken webhook doesn't flood the inbox.
 */
export async function alertError(db: DbOrTx, kind: string, message: string) {
  const hour = new Date().toISOString().slice(0, 13);
  await alertOwners(db, "owner_error", `${kind}:${hour}`, { kind, message: message.slice(0, 1000) });
}

export type OutboxResult = { sent: number; retrying: number; gaveUp: number };

/** Send what's due. Safe to run from several places at once. */
export async function processOutbox(db: Db, send: SendEmail, ctx: RenderContext, opts: { limit?: number } = {}): Promise<OutboxResult> {
  const result: OutboxResult = { sent: 0, retrying: 0, gaveUp: 0 };

  // Claim: push due rows' next attempt out by the lease, so nobody else picks them up meanwhile.
  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, sql`now()`)))
      .orderBy(asc(emailOutbox.nextAttemptAt))
      .limit(opts.limit ?? 25)
      .for("update", { skipLocked: true });
    for (const row of due) {
      await tx
        .update(emailOutbox)
        .set({ nextAttemptAt: sql`now() + make_interval(mins => ${LEASE_MINUTES})` })
        .where(eq(emailOutbox.id, row.id));
    }
    return due;
  });

  for (const row of claimed) {
    try {
      const email = await renderEmail(db, row.template as TemplateName, row.payload, ctx);
      if (!email) {
        await db.update(emailOutbox).set({ status: "failed", lastError: "Nothing to send any more" }).where(eq(emailOutbox.id, row.id));
        result.gaveUp++;
        continue;
      }
      // Keyed by the row: a retry after a send we never heard back from isn't a second email.
      await send({ to: row.toAddress, ...email, idempotencyKey: `outbox-${row.id}` });
      await db.update(emailOutbox).set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1, lastError: null }).where(eq(emailOutbox.id, row.id));
      result.sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      const wait = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]!;
      await db
        .update(emailOutbox)
        .set({
          attempts,
          lastError: (err as Error).message.slice(0, 1000),
          ...(giveUp ? { status: "failed" as const } : { nextAttemptAt: sql`now() + make_interval(mins => ${wait})` }),
        })
        .where(eq(emailOutbox.id, row.id));
      if (giveUp) result.gaveUp++;
      else result.retrying++;
    }
  }
  return result;
}

/** Emails that gave up, for the admin home page. */
export async function failedEmailCount(db: DbOrTx): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(emailOutbox).where(eq(emailOutbox.status, "failed"));
  return Number(row?.n ?? 0);
}
