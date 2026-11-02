/**
 * Turn on the frequent job's schedule inside the database: every 15 minutes
 * Postgres asks private.housekeeping_has_work() and calls the site only if
 * there is something to do, or if the site hasn't run the job for 3 hours (so
 * the admin can tell the schedule is alive). Safe to run again, for instance
 * after changing CRON_SECRET.
 *
 * Supabase only: it needs pg_cron, pg_net and Vault, so it isn't a migration.
 *
 *   npm run jobs:schedule -- https://astitva.store
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db/create";

config({ path: [".env.local", ".env"] });

async function main() {
  const site = process.argv[2]?.replace(/\/$/, "");
  const url = process.env.DATABASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!site?.startsWith("https://")) throw new Error("Give the live address: npm run jobs:schedule -- https://astitva.store");
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!secret) throw new Error("CRON_SECRET is not set: use the site's value.");

  const db = createDb(url, { max: 1 });
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`create extension if not exists pg_cron`);
      await tx.execute(sql`create extension if not exists pg_net`);
      // In Vault, so the secret isn't readable in the function's source or the cron table.
      const { rows } = await tx.execute<{ id: string }>(sql`select id from vault.secrets where name = 'cron_secret'`);
      if (rows[0]) await tx.execute(sql`select vault.update_secret(${rows[0].id}::uuid, ${secret}::text)`);
      else await tx.execute(sql`select vault.create_secret(${secret}::text, 'cron_secret'::text)`);
      await tx.execute(sql.raw(`
        create or replace function private.wake_housekeeping() returns void
        language plpgsql set search_path = pg_catalog, public as $fn$
        begin
          if private.housekeeping_has_work() or not exists (
            select 1 from audit_logs
            where action = 'job.ran' and resource_id = 'frequent' and created_at > now() - interval '3 hours'
          ) then
            perform net.http_post(
              url := '${site.replaceAll("'", "''")}/api/cron/frequent',
              headers := jsonb_build_object(
                'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
              ),
              timeout_milliseconds := 25000
            );
          end if;
        end
        $fn$`));
      await tx.execute(sql`revoke all on function private.wake_housekeeping() from public`);
      await tx.execute(sql`select cron.schedule('housekeeping', '*/15 * * * *', 'select private.wake_housekeeping()')`);
    });
    console.log(`The frequent job is scheduled in the database, calling ${site} when there's work.`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
