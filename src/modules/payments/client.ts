import "server-only";
import { env } from "@/lib/env";
import { createRazorpay, type Razorpay } from "./razorpay";

let cached: Razorpay | null | undefined;

/** Razorpay from the environment, or null when its keys aren't set (online payment is then not offered). */
export function razorpay(): Razorpay | null {
  if (cached !== undefined) return cached;
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = env();
  cached = keyId && keySecret ? createRazorpay({ keyId, keySecret }) : null;
  return cached;
}
