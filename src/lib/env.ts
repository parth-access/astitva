import { z } from "zod";

/**
 * Server environment, validated once at first use.
 * Never import this file from a Client Component: it would leak nothing
 * (Next strips non-NEXT_PUBLIC vars), but it would fail at runtime.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  // Blank counts as unset (a host's empty field): localhost in development; production refuses it (env()).
  APP_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().url().default("http://localhost:3000")),
  /** Signs sessions and encrypts 2FA secrets. Generate with `openssl rand -base64 32`. Changing it signs everyone out. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Sender for account emails, e.g. "Astitva <hello@yourdomain>". Must be on a domain verified in Resend. */
  EMAIL_FROM: z.string().optional(),
  // Optional until the milestones that need them (M3/M4).
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  /** "Sign in with Google" for customers. Both or neither; without them only the email code is offered. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Guards /api/cron/*. The scheduled GitHub workflow sends it as a Bearer token. `openssl rand -base64 32`. */
  CRON_SECRET: z.string().min(24).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  // In production the site's address must be set, not defaulted: emails, the
  // sitemap, share cards and sign-in would otherwise all point at localhost.
  if (process.env.NODE_ENV === "production" && !process.env.APP_URL?.trim()) {
    throw new Error("Invalid environment configuration:\n  - APP_URL: set it to the live address, e.g. https://astitva.in (no trailing slash).");
  }
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
