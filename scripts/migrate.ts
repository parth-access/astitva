/**
 * Apply the SQL migrations in ./drizzle to DATABASE_URL, using the same
 * connection and TLS settings as the app.
 *
 *   npm run db:migrate
 */
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/db/create";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  const db = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log(`Migrations applied to ${new URL(url).hostname}.`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
