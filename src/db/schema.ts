/**
 * Astitva launch schema (revised PRD, section P8).
 *
 * Conventions
 * - All money columns end in `_minor` and hold integer paise (tax-inclusive).
 * - Products and variants are archived, never deleted; order history keeps
 *   snapshots so it survives edits.
 * - Invariants that the database can enforce are enforced here (CHECK,
 *   UNIQUE, partial UNIQUE). The rest live in src/modules/* and are tested.
 * - Every table calls .enableRLS() with no policies. On Supabase this stops
 *   the public Data API (anon/authenticated keys) from reading or writing
 *   anything; the app connects as the table owner, which RLS does not apply
 *   to. A test fails if a table is added without it.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => bigint(name, { mode: "number" });

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const productSourceType = pgEnum("product_source_type", ["curated", "own_brand"]);
export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);
export const chapterStatus = pgEnum("chapter_status", ["draft", "published"]);
export const itemCondition = pgEnum("item_condition", ["new_with_tags", "new", "like_new", "gently_used"]);

export const adminRole = pgEnum("admin_role", ["owner", "staff"]);

/** Fulfilment only. Payment, COD, returns and refunds have their own records. */
export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
]);
/** Roll-up of money actually received for the order. */
export const orderPaymentStatus = pgEnum("order_payment_status", [
  "unpaid",
  "paid",
  "partially_refunded",
  "refunded",
]);
export const paymentMethod = pgEnum("payment_method", ["online", "cod"]);
export const paymentAttemptStatus = pgEnum("payment_attempt_status", [
  "created",
  "authorized",
  "captured",
  "failed",
]);
export const reservationStatus = pgEnum("reservation_status", ["active", "committed", "released", "expired"]);
export const inventoryMovementType = pgEnum("inventory_movement_type", [
  "receipt",
  "sale",
  "cancellation_restock",
  "return_restock",
  "adjustment",
  "damage",
]);
export const codCollectionStatus = pgEnum("cod_collection_status", [
  "pending",
  "collected_by_courier",
  "remitted",
  "failed",
]);
export const shipmentStatus = pgEnum("shipment_status", ["shipped", "delivered", "returned_to_origin"]);
export const refundStatus = pgEnum("refund_status", ["initiated", "succeeded", "failed"]);
export const refundMethod = pgEnum("refund_method", ["razorpay", "manual_bank", "manual_upi"]);
export const actorType = pgEnum("actor_type", ["customer", "admin", "system"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed"]);

/* ------------------------------------------------------------------ */
/* People and access                                                   */
/* ------------------------------------------------------------------ */

/** Customers (post-launch accounts) and staff share this table. Auth tables are added with the auth milestone. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 16 }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`).where(sql`${t.email} is not null`),
  ],
).enableRLS();

export const adminRoleAssignments = pgTable("admin_role_assignments", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  role: adminRole("role").notNull(),
  createdAt: createdAt(),
}).enableRLS();

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  contact: text("contact"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 80 }).notNull(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}).enableRLS();

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}).enableRLS();

/**
 * A chapter is a release: a set of pieces launched together with a letter
 * from Krishna. Chapter I is the launch collection; own-label clothing later
 * arrives as further chapters.
 */
export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 1 for "Chapter I". Shown in Roman numerals. */
    number: smallint("number").notNull().unique(),
    slug: varchar("slug", { length: 96 }).notNull().unique(),
    title: varchar("title", { length: 80 }).notNull(),
    /** One line under the title, e.g. what the chapter is about. */
    subtitle: varchar("subtitle", { length: 200 }),
    /** The founder's letter that opens the chapter. Blank lines separate paragraphs. */
    letter: text("letter").notNull().default(""),
    letterSignature: varchar("letter_signature", { length: 60 }),
    coverImageUrl: text("cover_image_url"),
    coverImageAlt: varchar("cover_image_alt", { length: 240 }),
    /** Hex colour shown while the cover loads, or instead of it. */
    tone: varchar("tone", { length: 7 }),
    status: chapterStatus("status").notNull().default("draft"),
    /** When the chapter opens for purchase. Shown on the site; enforced at checkout. */
    releaseAt: timestamp("release_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("chapters_number_pos", sql`${t.number} > 0`),
    check("chapters_tone_hex", sql`${t.tone} is null or ${t.tone} ~ '^#[0-9a-fA-F]{6}$'`),
    check("chapters_published_has_release", sql`${t.status} <> 'published' or ${t.releaseAt} is not null`),
  ],
).enableRLS();

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    description: text("description").notNull().default(""),
    sourceType: productSourceType("source_type").notNull().default("curated"),
    status: productStatus("status").notNull().default("draft"),
    material: varchar("material", { length: 160 }),
    fit: varchar("fit", { length: 160 }),
    careInstructions: text("care_instructions"),
    isFeatured: boolean("is_featured").notNull().default(false),
    chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
    /** The piece's place in the house's sequence: "Nº 07". Unique across all chapters, never reused. */
    pieceNumber: integer("piece_number").unique(),
    /** The piece's given name, e.g. "Saanjh". `name` stays the plain description ("Taupe knit midi dress"). */
    pieceName: varchar("piece_name", { length: 60 }),
    /** Where and how the piece was found, in Krishna's words. */
    story: text("story"),
    /** How Krishna would wear it. */
    stylingNote: text("styling_note"),
    /** Dominant colour (hex), used behind images while they load and on photo-less placeholders. */
    tone: varchar("tone", { length: 7 }),
    seoTitle: varchar("seo_title", { length: 160 }),
    seoDescription: varchar("seo_description", { length: 320 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_status_published_idx").on(t.status, t.publishedAt.desc()),
    index("products_chapter_idx").on(t.chapterId, t.pieceNumber),
    check("products_piece_number_pos", sql`${t.pieceNumber} is null or ${t.pieceNumber} > 0`),
    check("products_tone_hex", sql`${t.tone} is null or ${t.tone} ~ '^#[0-9a-fA-F]{6}$'`),
    check(
      "products_published_has_date",
      sql`${t.status} <> 'active' or ${t.publishedAt} is not null`,
    ),
  ],
).enableRLS();

export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.categoryId] }),
    index("product_categories_category_idx").on(t.categoryId, t.productId),
  ],
).enableRLS();

export const productCollections = pgTable(
  "product_collections",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.collectionId] }),
    index("product_collections_collection_idx").on(t.collectionId, t.sortOrder),
  ],
).enableRLS();

/** Garment measurements in centimetres, shown on the product page. */
export type Measurements = {
  bustCm?: number;
  waistCm?: number;
  hipCm?: number;
  lengthCm?: number;
  shoulderCm?: number;
  sleeveCm?: number;
};

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    size: varchar("size", { length: 24 }),
    color: varchar("color", { length: 48 }),
    priceMinor: money("price_minor").notNull(),
    compareAtMinor: money("compare_at_minor"),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    /** Physical units in hand that have not been sold. Only the inventory module writes this. */
    onHand: integer("on_hand").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    measurements: jsonb("measurements").$type<Measurements>(),
    // Internal only, never sent to the storefront.
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    acquisitionCostMinor: money("acquisition_cost_minor"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }),
    condition: itemCondition("condition"),
    internalRef: varchar("internal_ref", { length: 120 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("product_variants_product_idx").on(t.productId),
    uniqueIndex("product_variants_attrs_uq").on(
      t.productId,
      sql`coalesce(${t.size}, '')`,
      sql`coalesce(${t.color}, '')`,
    ),
    check("product_variants_price_nonneg", sql`${t.priceMinor} >= 0`),
    check(
      "product_variants_compare_at_gt_price",
      sql`${t.compareAtMinor} is null or ${t.compareAtMinor} > ${t.priceMinor}`,
    ),
    check("product_variants_on_hand_nonneg", sql`${t.onHand} >= 0`),
    check("product_variants_low_stock_nonneg", sql`${t.lowStockThreshold} >= 0`),
    check("product_variants_cost_nonneg", sql`${t.acquisitionCostMinor} is null or ${t.acquisitionCostMinor} >= 0`),
    check("product_variants_currency_inr", sql`${t.currency} = 'INR'`),
  ],
).enableRLS();

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    altText: varchar("alt_text", { length: 240 }).notNull().default(""),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder)],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Store configuration                                                 */
/* ------------------------------------------------------------------ */

/** Single-row table (id = 1). Business settings Krishna can change without code. */
export const storeSettings = pgTable(
  "store_settings",
  {
    id: smallint("id").primaryKey().default(1),
    codEnabled: boolean("cod_enabled").notNull().default(false),
    codMaxOrderMinor: money("cod_max_order_minor").notNull().default(500_000),
    codFeeMinor: money("cod_fee_minor").notNull().default(0),
    shippingFlatMinor: money("shipping_flat_minor").notNull().default(0),
    freeShippingThresholdMinor: money("free_shipping_threshold_minor"),
    restrictToListedPincodes: boolean("restrict_to_listed_pincodes").notNull().default(false),
    reservationTtlMinutes: integer("reservation_ttl_minutes").notNull().default(15),
    supportEmail: varchar("support_email", { length: 254 }),
    /** Digits only, with country code, e.g. 919812345678. Powers the "Ask about this piece" WhatsApp link. */
    supportWhatsapp: varchar("support_whatsapp", { length: 16 }),
    /** Who answers WhatsApp, shown as "Ask Krishna". Null shows "Ask us". */
    conciergeName: varchar("concierge_name", { length: 40 }),
    gstin: varchar("gstin", { length: 15 }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("store_settings_singleton", sql`${t.id} = 1`),
    check("store_settings_whatsapp_digits", sql`${t.supportWhatsapp} is null or ${t.supportWhatsapp} ~ '^[0-9]{10,15}$'`),
    check("store_settings_ttl_range", sql`${t.reservationTtlMinutes} between 5 and 60`),
    check(
      "store_settings_money_nonneg",
      sql`${t.codMaxOrderMinor} >= 0 and ${t.codFeeMinor} >= 0 and ${t.shippingFlatMinor} >= 0`,
    ),
  ],
).enableRLS();

export const pincodes = pgTable("pincodes", {
  pincode: varchar("pincode", { length: 6 }).primaryKey(),
  isServiceable: boolean("is_serviceable").notNull().default(true),
  codAllowed: boolean("cod_allowed").notNull().default(true),
}).enableRLS();

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** SHA-256 of the opaque cookie token; the raw token is never stored. */
    guestTokenHash: varchar("guest_token_hash", { length: 64 }).unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
).enableRLS();

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("cart_items_cart_variant_uq").on(t.cartId, t.variantId),
    check("cart_items_quantity_range", sql`${t.quantity} between 1 and 10`),
  ],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1001 });

export type AddressSnapshot = {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  countryCode: "IN";
};

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 16 })
      .notNull()
      .unique()
      .default(sql`'AST-' || lpad(nextval('order_number_seq')::text, 6, '0')`),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    contactName: varchar("contact_name", { length: 120 }).notNull(),
    contactEmail: varchar("contact_email", { length: 254 }),
    contactPhone: varchar("contact_phone", { length: 16 }).notNull(),
    orderStatus: orderStatus("order_status").notNull(),
    paymentStatus: orderPaymentStatus("payment_status").notNull().default("unpaid"),
    paymentMethod: paymentMethod("payment_method").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    subtotalMinor: money("subtotal_minor").notNull(),
    discountMinor: money("discount_minor").notNull().default(0),
    shippingMinor: money("shipping_minor").notNull().default(0),
    codFeeMinor: money("cod_fee_minor").notNull().default(0),
    /** GST included in the prices above, for invoices. Informational: not added to the total. */
    taxIncludedMinor: money("tax_included_minor").notNull().default(0),
    totalMinor: money("total_minor").notNull(),
    addressSnapshot: jsonb("address_snapshot").$type<AddressSnapshot>().notNull(),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    /** Guest cart id or user id: keys are unique per scope, not globally. */
    idempotencyScope: varchar("idempotency_scope", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    codVerifiedAt: timestamp("cod_verified_at", { withTimezone: true }),
    /** Customer agreed to show their city on the archive ("went home to Pune"). Off unless they opt in. */
    shareCityInArchive: boolean("share_city_in_archive").notNull().default(false),
    needsResolution: boolean("needs_resolution").notNull().default(false),
    resolutionNote: text("resolution_note"),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_idempotency_uq").on(t.idempotencyScope, t.idempotencyKey),
    index("orders_status_created_idx").on(t.orderStatus, t.createdAt),
    index("orders_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("orders_phone_idx").on(t.contactPhone),
    index("orders_needs_resolution_idx").on(t.createdAt).where(sql`${t.needsResolution}`),
    check(
      "orders_amounts_nonneg",
      sql`${t.subtotalMinor} >= 0 and ${t.discountMinor} >= 0 and ${t.shippingMinor} >= 0 and ${t.codFeeMinor} >= 0 and ${t.taxIncludedMinor} >= 0`,
    ),
    check("orders_discount_le_subtotal", sql`${t.discountMinor} <= ${t.subtotalMinor}`),
    check(
      "orders_total_consistent",
      sql`${t.totalMinor} = ${t.subtotalMinor} - ${t.discountMinor} + ${t.shippingMinor} + ${t.codFeeMinor}`,
    ),
    check("orders_cod_fee_only_cod", sql`${t.paymentMethod} = 'cod' or ${t.codFeeMinor} = 0`),
    check("orders_currency_inr", sql`${t.currency} = 'INR'`),
  ],
).enableRLS();

export type VariantSnapshot = { size?: string | null; color?: string | null; condition?: string | null };

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productNameSnapshot: varchar("product_name_snapshot", { length: 160 }).notNull(),
    skuSnapshot: varchar("sku_snapshot", { length: 64 }).notNull(),
    variantSnapshot: jsonb("variant_snapshot").$type<VariantSnapshot>().notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: money("unit_price_minor").notNull(),
    discountMinor: money("discount_minor").notNull().default(0),
    taxIncludedMinor: money("tax_included_minor").notNull().default(0),
    lineTotalMinor: money("line_total_minor").notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    check("order_items_quantity_pos", sql`${t.quantity} > 0`),
    check("order_items_amounts_nonneg", sql`${t.unitPriceMinor} >= 0 and ${t.discountMinor} >= 0`),
    check(
      "order_items_line_total_consistent",
      sql`${t.lineTotalMinor} = ${t.unitPriceMinor} * ${t.quantity} - ${t.discountMinor}`,
    ),
  ],
).enableRLS();

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    fromStatus: varchar("from_status", { length: 32 }),
    toStatus: varchar("to_status", { length: 32 }),
    actorType: actorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    status: reservationStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inventory_reservations_hold_idx").on(t.variantId, t.status, t.expiresAt),
    index("inventory_reservations_order_idx").on(t.orderId),
    uniqueIndex("inventory_reservations_one_live_per_line_uq")
      .on(t.orderId, t.variantId)
      .where(sql`${t.status} in ('active', 'committed')`),
    check("inventory_reservations_quantity_pos", sql`${t.quantity} > 0`),
  ],
).enableRLS();

/** Append-only. Every change to `product_variants.on_hand` writes exactly one row here, in the same transaction. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    movementType: inventoryMovementType("movement_type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    onHandAfter: integer("on_hand_after").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    reason: text("reason"),
    actorId: uuid("actor_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_movements_variant_idx").on(t.variantId, t.createdAt),
    check("inventory_movements_delta_nonzero", sql`${t.quantityDelta} <> 0`),
    check("inventory_movements_on_hand_after_nonneg", sql`${t.onHandAfter} >= 0`),
  ],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Payments, COD, shipping, refunds                                    */
/* ------------------------------------------------------------------ */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 24 }).notNull().default("razorpay"),
    providerOrderId: varchar("provider_order_id", { length: 64 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 64 }),
    amountMinor: money("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    status: paymentAttemptStatus("status").notNull().default("created"),
    failureReason: text("failure_reason"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    uniqueIndex("payments_provider_order_uq").on(t.provider, t.providerOrderId),
    uniqueIndex("payments_provider_payment_uq")
      .on(t.provider, t.providerPaymentId)
      .where(sql`${t.providerPaymentId} is not null`),
    check("payments_amount_pos", sql`${t.amountMinor} > 0`),
  ],
).enableRLS();

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 24 }).notNull().default("razorpay"),
    providerEventId: varchar("provider_event_id", { length: 96 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    /** Redacted: ids, amounts and status only. Never card data or contact details. */
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_events_provider_event_uq").on(t.provider, t.providerEventId)],
).enableRLS();

export const codCollections = pgTable(
  "cod_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    amountDueMinor: money("amount_due_minor").notNull(),
    status: codCollectionStatus("status").notNull().default("pending"),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    remittedAt: timestamp("remitted_at", { withTimezone: true }),
    remittanceReference: varchar("remittance_reference", { length: 120 }),
    confirmedBy: uuid("confirmed_by"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("cod_collections_amount_pos", sql`${t.amountDueMinor} > 0`)],
).enableRLS();

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    carrierName: varchar("carrier_name", { length: 80 }).notNull(),
    trackingNumber: varchar("tracking_number", { length: 80 }).notNull(),
    trackingUrl: text("tracking_url"),
    status: shipmentStatus("status").notNull().default("shipped"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shipments_order_idx").on(t.orderId)],
).enableRLS();

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    method: refundMethod("method").notNull(),
    amountMinor: money("amount_minor").notNull(),
    status: refundStatus("status").notNull().default("initiated"),
    providerRefundId: varchar("provider_refund_id", { length: 64 }).unique(),
    reason: text("reason").notNull(),
    initiatedBy: uuid("initiated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("refunds_order_idx").on(t.orderId),
    check("refunds_amount_pos", sql`${t.amountMinor} > 0`),
    check("refunds_razorpay_has_payment", sql`${t.method} <> 'razorpay' or ${t.paymentId} is not null`),
  ],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Audit and notifications                                             */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    action: varchar("action", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 48 }).notNull(),
    resourceId: varchar("resource_id", { length: 64 }).notNull(),
    requestId: varchar("request_id", { length: 64 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_resource_idx").on(t.resourceType, t.resourceId, t.createdAt)],
).enableRLS();

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** e.g. "order_confirmed:<orderId>" so the same email is never queued twice. */
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull().unique(),
    template: varchar("template", { length: 64 }).notNull(),
    toAddress: varchar("to_address", { length: 254 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("email_outbox_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`)],
).enableRLS();
