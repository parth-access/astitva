import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";
import { sslFromEnv, withoutSslParams } from "./ssl";

export type Db = NodePgDatabase<typeof schema> & { $client: Pool };
/** A transaction handle; module services accept either a Db or a Tx. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

/** Framework-agnostic factory so scripts and tests can build their own instance. */
export function createDb(connectionString: string, pool: Omit<PoolConfig, "connectionString"> = {}): Db {
  // TLS comes only from sslFromEnv (full verification); options in the URL would override it.
  const url = withoutSslParams(connectionString);
  const client = new Pool({ connectionString: url, max: 10, ssl: sslFromEnv(url), ...pool });
  return drizzle(client, { schema, casing: "snake_case" }) as Db;
}
