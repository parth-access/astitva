/** Shared by the auth configs and the browser forms; keep this file free of imports. */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Where Better Auth reads the visitor's IP for its sign-in limits. Netlify sets
 * x-nf-client-connection-ip itself, so it can't be faked; x-forwarded-for
 * (trusted only when it holds a single address) is the fallback elsewhere.
 */
export const IP_HEADERS = ["x-nf-client-connection-ip", "x-forwarded-for"];
