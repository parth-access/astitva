import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../../src/db/create";

/** Rebuild the test database from the migrations so tests run against the real schema. */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    console.warn("DATABASE_URL_TEST not set: integration tests will be skipped.");
    return;
  }
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("Refusing to reset a database whose name does not contain 'test'.");
  }
  const db = createDb(url, { max: 1 });
  try {
    await db.$client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await db.$client.end();
  }
}
