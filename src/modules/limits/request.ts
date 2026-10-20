import "server-only";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { allow, type Limit } from "./service";

/**
 * The visitor's IP as the host reports it (Netlify sets x-nf-client-connection-ip;
 * elsewhere the first x-forwarded-for hop). "unknown" shares one bucket.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}

/** Count one action against a limit for this request's visitor (or the given subject). */
export async function allowRequest(limit: Limit, subject?: string): Promise<boolean> {
  return allow(db, limit, subject ?? (await clientIp()), env().BETTER_AUTH_SECRET);
}
