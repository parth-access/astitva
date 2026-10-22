import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { createCustomerAuth, readCustomer, type Customer } from "./customer-config";

const e = env();
export const customerAuth = createCustomerAuth(db, {
  baseURL: e.APP_URL,
  secret: e.BETTER_AUTH_SECRET,
  google: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } : undefined,
});

export type { Customer };

/** The signed-in customer, read once per request. Null when signed out. */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  // Reading the session checks its expiry against the clock: always at request time, never prerendered.
  await connection();
  return readCustomer(customerAuth, await headers());
});

/** Whether "Sign in with Google" is offered. */
export const googleSignIn = () => Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);

/** For account pages and actions: the signed-in customer, or off to sign in (coming back to `next`). */
export async function requireCustomer(next = "/account"): Promise<Customer> {
  const customer = await getCustomer();
  if (!customer) redirect(`/account/sign-in?next=${encodeURIComponent(next)}`);
  return customer;
}

