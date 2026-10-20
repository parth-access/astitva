import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/auth/auth";

/** Better Auth's endpoints (sign-in, 2FA, password reset). Rate limits apply here. */
export const { GET, POST } = toNextJsHandler(auth);
