import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { hasDb, makeDb } from "./helpers";

describe.skipIf(!hasDb)("database security", () => {
  const db = makeDb(2);
  afterAll(async () => {
    await db.$client.end();
  });

  it("every table in public has row-level security enabled", async () => {
    const { rows } = await db.execute<{ relname: string }>(sql`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by 1`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("migrations simulate Supabase's API roles and leave them no privileges", async () => {
    // Recreate the Supabase roles locally, grant what Supabase grants, then re-run the lockdown.
    await db.execute(sql`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      end $$`);
    await db.execute(sql`grant all on all tables in schema public to anon, authenticated`);
    const { readFile } = await import("node:fs/promises");
    await db.execute(sql.raw(await readFile("drizzle/0003_lock_down_supabase_roles.sql", "utf8")));

    const { rows } = await db.execute<{ grantee: string; table_name: string }>(sql`
      select grantee, table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`);
    expect(rows).toEqual([]);
  });
});
