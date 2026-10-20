import { describe, expect, it } from "vitest";
import { isCronRequest } from "../../src/modules/jobs/auth";
import { contentSecurityPolicy, securityHeaders } from "../../src/lib/security-headers";

describe("scheduled job guard", () => {
  const secret = "a-long-enough-cron-secret-value";
  it("needs the exact Bearer secret", () => {
    expect(isCronRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronRequest(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isCronRequest(secret, secret)).toBe(false);
    expect(isCronRequest(null, secret)).toBe(false);
  });
  it("is off when no secret is configured", () => {
    expect(isCronRequest("Bearer ", undefined)).toBe(false);
    expect(isCronRequest("Bearer anything", "")).toBe(false);
  });
});

describe("security headers", () => {
  const prod = Object.fromEntries(securityHeaders(false).map((h) => [h.key, h.value]));
  it("forbids framing, sniffing and plugins in production, and forces HTTPS", () => {
    expect(prod["X-Frame-Options"]).toBe("DENY");
    expect(prod["X-Content-Type-Options"]).toBe("nosniff");
    expect(prod["Strict-Transport-Security"]).toMatch(/max-age=63072000/);
    const csp = prod["Content-Security-Policy"]!;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("lets Razorpay's checkout and Cloudinary's photos through, and nothing else from outside", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toMatch(/script-src [^;]*https:\/\/checkout\.razorpay\.com/);
    expect(csp).toMatch(/frame-src [^;]*https:\/\/api\.razorpay\.com/);
    expect(csp).toMatch(/img-src [^;]*https:\/\/res\.cloudinary\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/api\.cloudinary\.com/);
    const hosts = csp.match(/https:\/\/[a-z.]+/g)!;
    expect(new Set(hosts.map((h) => h.split(".").slice(-2).join(".")))).toEqual(new Set(["razorpay.com", "cloudinary.com"]));
  });
  it("relaxes only what the dev server needs", () => {
    const dev = Object.fromEntries(securityHeaders(true).map((h) => [h.key, h.value]));
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
    expect(dev["Content-Security-Policy"]).toContain("'unsafe-eval'");
  });
});
