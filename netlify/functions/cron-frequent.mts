/**
 * The 15-minute housekeeping (src/app/api/cron/[job]/route.ts), run by
 * Netlify on its schedule. GitHub's scheduled workflows ran it hours apart,
 * so this replaces their frequent run; GitHub keeps the daily one.
 *
 * Netlify runs scheduled functions on the published production deploy only,
 * and sets URL to the site's main address. CRON_SECRET is the site's own.
 */
export default async function cronFrequent(): Promise<Response> {
  const site = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!site || !secret) {
    console.log("[cron-frequent] URL or CRON_SECRET is not set; skipping.");
    return new Response(null, { status: 204 });
  }
  // Scheduled functions stop after 30 seconds.
  const res = await fetch(`${site}/api/cron/frequent`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  console.log(`[cron-frequent] ${res.status} ${(await res.text()).slice(0, 500)}`);
  return new Response(null, { status: res.ok ? 204 : 502 });
}

export const config = { schedule: "*/15 * * * *" };
