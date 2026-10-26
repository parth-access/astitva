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
import type { PhotoEdit } from "@/lib/photo-edit";

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
export const itemCondition = pgEnum("item_condition", ["new_with_tags", "new", "like_new", "gently_used"]);

export const adminRole = pgEnum("admin_role", ["owner", "staff"]);
/** Which sign-in made a session: the admin's (password + 2FA) or a customer's (email code, Google). */
export const sessionKind = pgEnum("session_kind", ["admin", "customer"]);

/** Fulfilment only. Payment, COD, returns and refunds have their own records. */
export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  /** Shipped, but the courier brought it back undelivered (RTO). The stock is back on the shelf. */
  "returned",
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
export const discountKind = pgEnum("discount_kind", ["percent", "amount"]);

/* ------------------------------------------------------------------ */
/* People and access                                                   */
/* ------------------------------------------------------------------ */

/**
 * Customers and staff share this table. It is also Better Auth's `user` model
 * (src/modules/auth): `emailVerified`, `image` and `twoFactorEnabled` are the
 * names Better Auth expects. Only people with a row in admin_role_assignments
 * can reach /admin, and they can't sign in as customers (see auth_sessions.kind).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 16 }),
    emailVerified: boolean("email_verified").notNull().default(false),
    /** The phone was proved with a code. Only then are guest orders with that number linked to the account. */
    phoneVerified: boolean("phone_verified").notNull().default(false),
    image: text("image"),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`).where(sql`${t.email} is not null`),
  ],
).enableRLS();

/*
 * Better Auth tables (shapes from `npx auth generate`, v1.7). Columns keep
 * Better Auth's property names; table names carry an auth_ prefix and are
 * mapped in src/modules/auth/auth.ts.
 */

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /**
     * Set by the sign-in that made the session and never changed. Both share
     * this table and the secret, so the admin accepts only `admin` sessions
     * and the store only `customer` ones. No default, so a session must say.
     */
    kind: sessionKind("kind").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
).enableRLS();

/** Sign-in methods. A password sign-in is providerId "credential"; `password` holds its hash. */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
).enableRLS();

/** Short-lived tokens: password reset links, 2FA challenges, trusted devices. */
export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
).enableRLS();

/** Authenticator-app secret and backup codes, both encrypted by Better Auth. */
export const authTwoFactors = pgTable(
  "auth_two_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("auth_two_factors_secret_idx").on(t.secret), index("auth_two_factors_user_idx").on(t.userId)],
).enableRLS();

/** Sign-in rate limits. Kept in the database because serverless instances don't share memory. */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
}).enableRLS();

export const adminRoleAssignments = pgTable("admin_role_assignments", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  role: adminRole("role").notNull(),
  createdAt: createdAt(),
}).enableRLS();

/** A customer's saved delivery addresses, offered at checkout. Orders keep their own snapshot. */
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientName: varchar("recipient_name", { length: 120 }).notNull(),
    /** 10 national digits, as on orders. */
    phone: varchar("phone", { length: 16 }).notNull(),
    line1: varchar("line1", { length: 200 }).notNull(),
    line2: varchar("line2", { length: 200 }),
    landmark: varchar("landmark", { length: 120 }),
    city: varchar("city", { length: 80 }).notNull(),
    state: varchar("state", { length: 80 }).notNull(),
    pincode: varchar("pincode", { length: 6 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("customer_addresses_user_idx").on(t.userId),
    // At most one default per customer.
    uniqueIndex("customer_addresses_default_uq").on(t.userId).where(sql`${t.isDefault}`),
  ],
).enableRLS();

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
    /** The style's number in the house's sequence: "Nº 07". Unique, never reused. */
    pieceNumber: integer("piece_number").unique(),
    /** The piece's given name, e.g. "Saanjh". `name` stays the plain description ("Taupe knit midi dress"). */
    pieceName: varchar("piece_name", { length: 60 }),
    /** Where and how the piece was found, in Krishna's words. */
    story: text("story"),
    /** How Krishna would wear it. */
    stylingNote: text("styling_note"),
    /** Dominant colour (hex), used behind images while they load and on photo-less placeholders. */
    tone: varchar("tone", { length: 7 }),
    /** A video of the piece turning round once (Cloudinary). The piece page cuts it into frames for a drag-to-turn view. */
    spinVideoUrl: text("spin_video_url"),
    seoTitle: varchar("seo_title", { length: 160 }),
    seoDescription: varchar("seo_description", { length: 320 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_status_published_idx").on(t.status, t.publishedAt.desc()),
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

/** Pieces a customer has hearted. By style, not colour or size. */
export const savedPieces = pgTable(
  "saved_pieces",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] }), index("saved_pieces_user_created_idx").on(t.userId, t.createdAt.desc())],
).enableRLS();

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    size: varchar("size", { length: 24 }),
    /** Colour name as the customer sees it, e.g. "Sage". Variants of one colour share it exactly. */
    color: varchar("color", { length: 48 }),
    /** The colour's swatch (hex). Also tints the painted sketch until there are photos. */
    colorHex: varchar("color_hex", { length: 7 }),
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
    check("product_variants_color_hex", sql`${t.colorHex} is null or ${t.colorHex} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
).enableRLS();

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** The address the site shows: the original, or the original with its edit applied (lib/photo-edit.ts). */
    url: text("url").notNull(),
    /** The untouched upload, once the photo has been edited; null while url is the original. */
    originalUrl: text("original_url"),
    /** Flip, quarter turns and 4:5 crop, applied by Cloudinary on delivery. Null: shown as uploaded. */
    edit: jsonb("edit").$type<PhotoEdit>(),
    /** The colour this photo shows (matches product_variants.color); null for photos of every colour. */
    color: varchar("color", { length: 48 }),
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
    /** The brand's profiles elsewhere (Instagram, Pinterest…), https only. Tell search engines they're the same brand. */
    profileLinks: text("profile_links").array().notNull().default(sql`'{}'::text[]`),
    /** Customers can add to bag and check out. Off while the site is a preview. */
    orderingOpen: boolean("ordering_open").notNull().default(false),
    /** The home page lookbook's title and line, e.g. "Autumn–Winter 2026". */
    lookbookTitle: varchar("lookbook_title", { length: 80 }),
    lookbookSubtitle: varchar("lookbook_subtitle", { length: 200 }),
    /** Krishna's note on the home page. Blank lines separate paragraphs. */
    note: text("note").notNull().default(""),
    noteSignature: varchar("note_signature", { length: 60 }),
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
  // A signed-in customer's bag is found by its owner.
  (t) => [index("carts_user_idx").on(t.userId)],
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
/* Discount codes                                                      */
/* ------------------------------------------------------------------ */

/** A code a buyer types at checkout. Created by an owner in the admin. */
export const discountCodes = pgTable(
  "discount_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored in capitals; buyers may type it any way. */
    code: varchar("code", { length: 32 }).notNull().unique(),
    kind: discountKind("kind").notNull(),
    /** percent: basis points (1000 = 10%). amount: paise off the pieces. */
    value: integer("value").notNull(),
    /** The pieces must come to at least this before the discount. */
    minSubtotalMinor: money("min_subtotal_minor").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Null: no limit. Counts orders placed with it; a cancelled or unpaid order gives its use back. */
    maxUses: integer("max_uses"),
    usesCount: integer("uses_count").notNull().default(0),
    /** At most one live order per phone number with this code. */
    onePerPhone: boolean("one_per_phone").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    /** For the admin only, e.g. "Instagram launch". */
    note: varchar("note", { length: 200 }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("discount_codes_code_format", sql`${t.code} ~ '^[A-Z0-9-]{3,32}$'`),
    check("discount_codes_value", sql`(${t.kind} = 'percent' and ${t.value} between 1 and 9000) or (${t.kind} = 'amount' and ${t.value} > 0)`),
    check("discount_codes_min_nonneg", sql`${t.minSubtotalMinor} >= 0`),
    check("discount_codes_uses", sql`${t.usesCount} >= 0 and (${t.maxUses} is null or (${t.maxUses} > 0 and ${t.usesCount} <= ${t.maxUses}))`),
    check("discount_codes_window", sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.startsAt} < ${t.endsAt}`),
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
    /** The code used, as typed into the order (kept if the code is later changed or removed). */
    discountCode: varchar("discount_code", { length: 32 }),
    discountCodeId: uuid("discount_code_id").references(() => discountCodes.id, { onDelete: "set null" }),
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

/* ------------------------------------------------------------------ */
/* Receipts                                                            */
/* ------------------------------------------------------------------ */

export const receiptNumberSeq = pgSequence("receipt_number_seq", { startWith: 1 });

/** The order as the receipt shows it, frozen when the receipt is issued. */
export type ReceiptSnapshot = {
  orderNumber: string;
  placedAt: string;
  buyer: { name: string; phone: string; email: string | null };
  address: AddressSnapshot;
  items: { name: string; variant: VariantSnapshot; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[];
  subtotalMinor: number;
  discountMinor: number;
  discountCode: string | null;
  shippingMinor: number;
  codFeeMinor: number;
  totalMinor: number;
};

/**
 * One receipt per order, numbered in sequence. Cash on delivery: issued when
 * the order is placed, for the amount to pay on delivery. Online: issued when
 * the payment is captured. Never edited; refunds show beside it.
 */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptNumber: varchar("receipt_number", { length: 16 })
      .notNull()
      .unique()
      .default(sql`'ASTR-' || lpad(nextval('receipt_number_seq')::text, 6, '0')`),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentMethod: paymentMethod("payment_method").notNull(),
    amountMinor: money("amount_minor").notNull(),
    /** Online: how Razorpay says it was paid (upi, card, netbanking, wallet…). */
    paidWith: varchar("paid_with", { length: 24 }),
    /** Online: Razorpay's payment id, the buyer's reference. */
    providerPaymentId: varchar("provider_payment_id", { length: 64 }),
    /** Online: when the money was captured. Cash on delivery: null (paid later, to the courier). */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    snapshot: jsonb("snapshot").$type<ReceiptSnapshot>().notNull(),
    issuedAt: createdAt(),
  },
  (t) => [
    check("receipts_amount_pos", sql`${t.amountMinor} > 0`),
    check("receipts_online_paid", sql`${t.paymentMethod} = 'cod' or ${t.paidAt} is not null`),
  ],
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

/**
 * "Tell me when it's back": an email waiting for one colour and size to return.
 * Notified once, then deleted after a while; never used for anything else.
 */
export const stockAlerts = pgTable(
  "stock_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 254 }).notNull(),
    createdAt: createdAt(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    // One waiting alert per person per colour and size.
    uniqueIndex("stock_alerts_waiting_uq").on(t.variantId, t.email).where(sql`${t.notifiedAt} is null`),
    index("stock_alerts_waiting_idx").on(t.variantId).where(sql`${t.notifiedAt} is null`),
  ],
).enableRLS();

/**
 * Fixed-window counters for the shop's own abuse limits (adding to the bag,
 * placing orders). Keys are hashed; old windows are cleared daily. Better
 * Auth keeps its own sign-in limits in auth_rate_limits.
 */
export const requestLimits = pgTable("request_limits", {
  key: varchar("key", { length: 96 }).primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(0),
}).enableRLS();

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
