import { timingSafeEqual } from "node:crypto";

/** Bearer CRON_SECRET, compared in constant time. Without the secret set, the jobs are off. */
export function isCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
