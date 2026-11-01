import { sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/create";
import { CATEGORIES, type ActivityCategory, type ActivityRow } from "./describe";

/**
 * Everything that has happened in the shop, newest first, read from the
 * tables where it was recorded: the audit log, order events, stock movements,
 * emails, Razorpay's webhooks, new accounts, alerts and saved pieces. Nothing
 * is copied into a second log, so it can't drift from what really happened.
 *
 * Order actions are written to both the audit log and order events; the audit
 * copies are left out here so each shows once.
 */
export type ActivityFilter = {
  category?: ActivityCategory;
  orderId?: string;
  productId?: string;
  /** Matches who, the order number, the piece, the buyer and the email address. */
  search?: string;
  from?: Date;
  /** Before this moment. */
  to?: Date;
  /** The `cursor` of the last row already shown. */
  before?: string;
  limit?: number;
};

/** Actions recorded twice: see above. */
const ALSO_ORDER_EVENTS = sql`('order.packed', 'order.unpacked', 'order.shipped', 'order.delivered', 'order.returned', 'order.cancelled', 'order.resolved', 'order.cod_verified', 'order.cod_remitted')`;

const FEED = sql`
  select 'a' || a.id::text as id, a.created_at as at, a.action as kind, u.name as actor_name, 'admin' as actor_type,
    a.metadata as meta, o.id::text as order_id, o.order_number, p.id::text as product_id, coalesce(p.piece_name, p.name) as piece,
    pv.color, pv.size,
    case
      when a.action like 'order.%' then 'payments'
      when a.action like 'piece.%' then 'pieces'
      when a.action in ('admin.signed_in', 'admin.signed_out', 'admin.sign_in_failed', 'admin.code_failed', 'admin.password_reset_requested', 'customer.signed_in') then 'signins'
      when a.action like 'customer.%' or a.action like 'bag.%' then 'customers'
      when a.action like 'job.%' then 'system'
      else 'settings'
    end as category,
    concat_ws(' ', u.name, o.order_number, o.contact_name, p.piece_name, p.name, a.metadata->>'email', a.metadata->>'code') as haystack
  from audit_logs a
  left join users u on u.id = a.actor_id
  left join orders o on a.resource_type = 'order' and o.id::text = a.resource_id
  left join product_variants pv on a.resource_type = 'variant' and pv.id::text = a.resource_id
  left join products p on (a.resource_type = 'product' and p.id::text = a.resource_id) or p.id = pv.product_id
  where not (a.resource_type = 'order' and a.action in ${ALSO_ORDER_EVENTS})
    and not (a.action = 'job.ran' and coalesce(a.metadata->>'busy', '') <> 'true')

  union all
  select 'e' || e.id::text, e.created_at, e.event_type, u.name, e.actor_type::text,
    e.metadata, o.id::text, o.order_number, null, null, null, null,
    case when e.event_type like 'payment.%' or e.event_type like 'refund.%' or e.event_type like 'cod.%' then 'payments' else 'orders' end,
    concat_ws(' ', u.name, o.order_number, o.contact_name, o.contact_email, o.contact_phone)
  from order_events e
  join orders o on o.id = e.order_id
  left join users u on u.id = e.actor_id

  union all
  select 'm' || m.id::text, m.created_at, 'stock.' || m.movement_type::text, u.name, case when m.actor_id is null then 'system' else 'admin' end,
    jsonb_build_object('delta', m.quantity_delta, 'onHandAfter', m.on_hand_after, 'reason', m.reason),
    o.id::text, o.order_number, p.id::text, coalesce(p.piece_name, p.name), pv.color, pv.size,
    'stock',
    concat_ws(' ', u.name, o.order_number, p.piece_name, p.name, pv.color, pv.size, m.reason)
  from inventory_movements m
  join product_variants pv on pv.id = m.variant_id
  join products p on p.id = pv.product_id
  left join orders o on o.id = m.order_id
  left join users u on u.id = m.actor_id

  union all
  select 'o' || x.id::text, x.created_at, 'email.' || x.template, null, 'system',
    jsonb_build_object('status', x.status, 'to', x.to_address, 'attempts', x.attempts, 'error', x.last_error, 'sentAt', x.sent_at, 'title', x.payload->>'title'),
    o.id::text, o.order_number, null, null, null, null,
    case when x.template = 'owner_error' then 'system' else 'emails' end,
    concat_ws(' ', x.to_address, x.template, o.order_number, o.contact_name)
  from email_outbox x
  left join orders o on o.id::text = x.payload->>'orderId'

  union all
  select 'r' || r.id::text, r.created_at, 'razorpay.' || r.event_type, null, 'razorpay',
    r.summary || jsonb_build_object('error', r.processing_error),
    o.id::text, o.order_number, null, null, null, null,
    'payments',
    concat_ws(' ', o.order_number, o.contact_name, r.event_type)
  from payment_events r
  left join payments pay on pay.id = r.payment_id
  left join orders o on o.id = pay.order_id

  union all
  select 'u' || c.id::text, c.created_at, 'customer.signed_up', c.name, 'customer',
    jsonb_build_object('email', c.email), null, null, null, null, null, null,
    'customers',
    concat_ws(' ', c.name, c.email)
  from users c
  where not exists (select 1 from admin_role_assignments r where r.user_id = c.id)

  union all
  select 's' || s.id::text, s.created_at, 'alert.requested', null, 'customer',
    jsonb_build_object('email', s.email, 'notifiedAt', s.notified_at), null, null, p.id::text, coalesce(p.piece_name, p.name), pv.color, pv.size,
    'customers',
    concat_ws(' ', s.email, p.piece_name, p.name, pv.color, pv.size)
  from stock_alerts s
  join product_variants pv on pv.id = s.variant_id
  join products p on p.id = pv.product_id

  union all
  select 'p' || sp.user_id::text || sp.product_id::text, sp.created_at, 'piece.saved', c.name, 'customer',
    null, null, null, p.id::text, coalesce(p.piece_name, p.name), null, null,
    'customers',
    concat_ws(' ', c.name, c.email, p.piece_name, p.name)
  from saved_pieces sp
  join users c on c.id = sp.user_id
  join products p on p.id = sp.product_id
`;

const CURSOR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[0-9a-z-]{1,80}$/;

/** `next`: pass as `before` for the following page; null on the last. */
export async function listActivity(db: DbOrTx, filter: ActivityFilter = {}): Promise<{ rows: ActivityRow[]; next: string | null }> {
  const limit = Math.min(filter.limit ?? 50, 200);
  const where: SQL[] = [];
  if (filter.category && CATEGORIES.some((c) => c.key === filter.category)) where.push(sql`category = ${filter.category}`);
  if (filter.orderId) where.push(sql`order_id = ${filter.orderId}`);
  if (filter.productId) where.push(sql`product_id = ${filter.productId}`);
  if (filter.from) where.push(sql`at >= ${filter.from.toISOString()}::timestamptz`);
  if (filter.to) where.push(sql`at < ${filter.to.toISOString()}::timestamptz`);
  const term = filter.search?.trim();
  if (term) where.push(sql`haystack ilike ${`%${term.replace(/[\\%_]/g, "\\$&")}%`}`);
  if (filter.before && CURSOR.test(filter.before)) {
    const [at, id] = filter.before.split("|") as [string, string];
    where.push(sql`(at, id) < (${at}::timestamptz, ${id})`);
  }

  const { rows } = await db.execute<ActivityRow & { cursor: string; at: Date | string }>(sql`
    select id, at, kind, actor_name as "actorName", actor_type as "actorType", meta, order_id as "orderId",
      order_number as "orderNumber", product_id as "productId", piece, color, size, category,
      to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || id as cursor
    from (${FEED}) feed
    ${where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``}
    order by at desc, id desc
    limit ${limit + 1}`);

  const page = rows.slice(0, limit).map((r) => ({ ...r, at: new Date(r.at) }));
  return { rows: page, next: rows.length > limit ? (rows[limit - 1]?.cursor ?? null) : null };
}
