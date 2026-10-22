import { z } from "zod";
import { addressFields, contactFields } from "@/modules/checkout/input";
import { normaliseMobile } from "@/lib/india";

/** The account forms, checked on the server. Errors come back keyed by field name. */

export type FieldErrors = Record<string, string>;
type Parsed<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

const addressSchema = z.object({ ...contactFields, ...addressFields });
export type AddressInput = z.infer<typeof addressSchema>;

const detailsSchema = z.object({
  name: z.string({ message: "Your name, please." }).trim().min(1, "Your name, please.").max(120, "Keep this under 120 characters."),
  phone: z.string().transform((v, ctx) => {
    if (v.trim() === "") return null;
    const n = normaliseMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "A 10-digit Indian mobile number, or leave it blank." });
      return z.NEVER;
    }
    return n;
  }),
});
export type DetailsInput = z.infer<typeof detailsSchema>;

/** Kept in step with CUSTOMER_PASSWORD_MIN in the auth config. */
export const PASSWORD_MIN = 8;

const signUpSchema = z.object({
  name: contactFields.name,
  phone: contactFields.phone,
  email: z.email("An email address, like you@example.com.").max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(128, "That's too long for a password."),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

function parse<T>(schema: z.ZodType<T>, form: FormData): Parsed<T> {
  const raw = Object.fromEntries([...form].filter(([, v]) => typeof v === "string"));
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
  return { ok: false, errors };
}

export const parseAddressForm = (form: FormData) => parse(addressSchema, form);
export const parseDetailsForm = (form: FormData) => parse(detailsSchema, form);
export const parseSignUpForm = (form: FormData) => parse(signUpSchema, form);
