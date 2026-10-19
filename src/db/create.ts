import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema> & { $client: Pool };
/** A transaction handle; module services accept either a Db or a Tx. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

/** Framework-agnostic factory so scripts and tests can build their own instance. */
export function createDb(connectionString: string, pool: Omit<PoolConfig, "connectionString"> = {}): Db {
  const client = new Pool({ connectionString, max: 10, ...pool });
  return drizzle(client, { schema, casing: "snake_case" }) as Db;
}
