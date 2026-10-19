import "server-only";
import { createDb, type Db } from "./create";
import { env } from "@/lib/env";

/**
 * One pool per server process. In development Next reloads modules on every
 * change, so the instance is kept on globalThis to avoid leaking pools.
 *
 * On Vercel use the provider's *pooled* connection string (Neon, Supabase
 * pooler) so serverless functions do not exhaust Postgres connections.
 */
const globalForDb = globalThis as unknown as { __astitvaDb?: Db };

export const db: Db = globalForDb.__astitvaDb ?? createDb(env().DATABASE_URL);

if (process.env.NODE_ENV !== "production") globalForDb.__astitvaDb = db;
