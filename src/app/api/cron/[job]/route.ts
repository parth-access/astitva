import { revalidateTag } from "next/cache";
import { db } from "@/db/client";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { alertError } from "@/modules/email/outbox";
import { isCronRequest } from "@/modules/jobs/auth";
import { runJob, type JobName } from "@/modules/jobs/service";
import { razorpay } from "@/modules/payments/client";

const JOBS: JobName[] = ["frequent", "daily"];

/**
 * Scheduled housekeeping:
 *   POST /api/cron/frequent   every 15 minutes, from netlify/functions/cron-frequent.mts
 *   POST /api/cron/daily      once a day, from .github/workflows/scheduled.yml (also keeps the free Supabase project awake)
 */
export async function POST(request: Request, { params }: RouteContext<"/api/cron/[job]">) {
  const { job } = await params;
  if (!isCronRequest(request.headers.get("authorization"), env().CRON_SECRET)) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  if (!JOBS.includes(job as JobName)) return Response.json({ error: "No such job" }, { status: 404 });

  try {
    const result = await runJob(db, job as JobName, {
      send: (e) => sendEmail(e),
      ctx: { appUrl: env().APP_URL, linkSecret: env().BETTER_AUTH_SECRET },
    }, razorpay());
    // Closed checkouts free stock the shop should show again.
    if ("abandoned" in result && (result.abandoned ?? 0) > 0) revalidateTag(CATALOG_TAG, "max");
    return Response.json({ ok: true, job, result });
  } catch (err) {
    console.error(`[cron ${job}]`, (err as Error).message);
    await alertError(db, `Scheduled job "${job}"`, (err as Error).message).catch(() => {});
    return Response.json({ error: "Job failed" }, { status: 500 });
  }
}
