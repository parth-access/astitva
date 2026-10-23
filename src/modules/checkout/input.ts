import { z } from "zod";
import type { AddressSnapshot } from "@/db/schema";
import { INDIAN_STATES, normaliseMobile, PINCODE_PATTERN } from "@/lib/india";

/**
 * The checkout form, checked on the server. Errors come back keyed by field
 * name so the form shows each in place. Amounts are never read from the form.
 */

const blank = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);
const required = (message: string, max: number) =>
  z.string({ message }).trim().min(1, message).max(max, `Keep this under ${max} characters.`);
const optional = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Keep this under ${max} characters.`).nullable());

/** Name, mobile and address, as checkout and saved addresses both ask for them. */
export const contactFields = {
  name: required("Your name, as the courier should ask for it.", 120),
  phone: z
    .string({ message: "A mobile number." })
    .transform((v, ctx) => {
      const n = normaliseMobile(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "A 10-digit Indian mobile number." });
        return z.NEVER;
      }
      return n;
    }),
};

export const addressFields = {
  line1: required("House or flat, and street.", 200),
  line2: optional(200),
  landmark: optional(120),
  city: required("Town or city.", 80),
  state: z.enum(INDIAN_STATES, { message: "Choose a state." }),
  pincode: z
    .string({ message: "A 6-digit pincode." })
    .trim()
    .regex(PINCODE_PATTERN, "A 6-digit pincode."),
};

const checkoutSchema = z.object({
  ...contactFields,
  email: z.preprocess(blank, z.email("An email address, or leave it blank.").max(254).nullable()),
  ...addressFields,
  note: optional(500),
  discountCode: optional(40),
  payment: z.enum(["cod", "online"], { message: "Choose how to pay." }),
  key: z.uuid("Please reload the page and try again."),
});

/** Delivering to a saved address: its fields come from the account, not the form. */
const savedAddressSchema = checkoutSchema.omit({ line1: true, line2: true, landmark: true, city: true, state: true, pincode: true });

export type CheckoutInput = {
  idempotencyKey: string;
  contact: { name: string; phone: string; email: string | null };
  address: AddressSnapshot;
  note: string | null;
  paymentMethod: "cod" | "online";
  /** As typed; checked and claimed under lock when the order is placed. */
  discountCode?: string | null;
};

export type CheckoutFieldErrors = Record<string, string>;

/**
 * `saved`: the customer chose one of their saved addresses (the caller reads
 * it from their account). The order goes there, to its recipient, and the
 * form's address fields are ignored.
 */
export function parseCheckoutForm(
  form: FormData,
  saved: AddressSnapshot | null = null,
): { ok: true; data: CheckoutInput } | { ok: false; errors: CheckoutFieldErrors } {
  const raw = Object.fromEntries([...form].filter(([, v]) => typeof v === "string"));
  const parsed = saved ? savedAddressSchema.safeParse(raw) : checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: CheckoutFieldErrors = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
    return { ok: false, errors };
  }
  const d = parsed.data;
  const address: AddressSnapshot =
    saved ??
    (() => {
      const a = d as z.infer<typeof checkoutSchema>;
      return {
        recipientName: a.name,
        phone: a.phone,
        line1: a.line1,
        ...(a.line2 ? { line2: a.line2 } : {}),
        ...(a.landmark ? { landmark: a.landmark } : {}),
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        countryCode: "IN",
      };
    })();
  return {
    ok: true,
    data: {
      idempotencyKey: d.key,
      contact: { name: d.name, phone: d.phone, email: d.email?.toLowerCase() ?? null },
      address,
      note: d.note,
      paymentMethod: d.payment,
      discountCode: d.discountCode,
    },
  };
}
