import { toNextJsHandler } from "better-auth/next-js";
import { customerAuth } from "@/modules/auth/customer";
import { isCustomerAuthPath } from "@/modules/auth/customer-config";

/**
 * Customers' sign-in (email code, Google). Only the paths in
 * CUSTOMER_AUTH_PATHS answer; the rest of Better Auth's endpoints are a 404
 * here. Rate limits apply.
 */
const handler = toNextJsHandler(customerAuth);
const allowed = (request: Request) => isCustomerAuthPath(new URL(request.url).pathname);

export function GET(request: Request) {
  return allowed(request) ? handler.GET(request) : new Response(null, { status: 404 });
}

export function POST(request: Request) {
  return allowed(request) ? handler.POST(request) : new Response(null, { status: 404 });
}
