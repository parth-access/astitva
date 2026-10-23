/**
 * Security headers for every response (next.config.ts).
 *
 * The content security policy names every outside host the browser talks to:
 * Cloudinary (photos; admin uploads go straight there), Razorpay (its checkout
 * script, its payment window in a frame, and its telemetry), and Google
 * Analytics (loaded only after the visitor says yes). Nothing may frame
 * this site, and no plugins or <base> tricks.
 *
 * Honest limit: Next.js streams its page data in inline scripts and the
 * first-visit intro runs inline too, so scripts need 'unsafe-inline'. A
 * nonce-based policy would make every page dynamic and lose prerendering.
 */
/** Google's published list for GA4 (its hits go to regional subdomains). */
const GOOGLE_ANALYTICS = {
  script: ["https://*.googletagmanager.com"],
  img: ["https://*.google-analytics.com", "https://*.googletagmanager.com"],
  connect: ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com"],
};

export function contentSecurityPolicy(dev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", ...GOOGLE_ANALYTICS.script, ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com", ...GOOGLE_ANALYTICS.img],
    "font-src": ["'self'"],
    "connect-src": ["'self'", "https://api.cloudinary.com", "https://api.razorpay.com", "https://lumberjack.razorpay.com", ...GOOGLE_ANALYTICS.connect, ...(dev ? ["ws:"] : [])],
    "frame-src": ["https://api.razorpay.com", "https://checkout.razorpay.com"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([k, v]) => [k, ...v].join(" "))
    .join("; ");
}

export function securityHeaders(dev: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    // Browsers only honour this over HTTPS; two years, as the preload list asks.
    ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
