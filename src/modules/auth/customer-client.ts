import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * Browser client for customers' sign-in. Like the admin's, it calls the auth
 * endpoints over HTTP so Better Auth's rate limits apply.
 */
export const customerAuthClient = createAuthClient({
  basePath: "/api/account",
  plugins: [emailOTPClient()],
});
