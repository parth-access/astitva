-- Is there anything for the frequent job to do? Asked every 15 minutes from inside the
-- database (scripts/schedule-housekeeping.ts), so a quiet shop never wakes the site.
-- One line per step of doJob() in src/modules/jobs/service.ts; change them together.
-- The private schema is out of reach of Supabase's Data API and its anon key.
CREATE SCHEMA IF NOT EXISTS "private";--> statement-breakpoint
REVOKE ALL ON SCHEMA "private" FROM PUBLIC;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "private"."housekeeping_has_work"() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  select
    -- closeAbandonedCheckouts (ABANDON_AFTER_MINUTES)
    exists (select 1 from orders where order_status = 'pending_payment' and payment_status = 'unpaid' and created_at < now() - interval '120 minutes')
    -- markLapsedReservations
    or exists (select 1 from inventory_reservations where status = 'active' and expires_at <= now())
    -- reconcileRefunds (RECONCILE_AFTER_MINUTES)
    or exists (select 1 from refunds where method = 'razorpay' and status = 'initiated' and created_at < now() - interval '10 minutes')
    -- notifyRestocked: someone is waiting for a variant that can be bought again
    or exists (
      select 1
      from stock_alerts a
      join product_variants v on v.id = a.variant_id
      join products p on p.id = v.product_id
      where a.notified_at is null and v.is_active and p.status = 'active'
        and v.on_hand > (
          select coalesce(sum(r.quantity), 0) from inventory_reservations r
          where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()
        )
    )
    -- processOutbox
    or exists (select 1 from email_outbox where status = 'pending' and next_attempt_at <= now())
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."housekeeping_has_work"() FROM PUBLIC;
