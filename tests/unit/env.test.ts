import { afterEach, describe, expect, it, vi } from "vitest";

const base = { DATABASE_URL: "postgres://localhost:5432/x", BETTER_AUTH_SECRET: "s".repeat(32) };

describe("environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function freshEnv(vars: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries({ ...base, ...vars })) vi.stubEnv(k, v as string);
    vi.resetModules();
    return (await import("../../src/lib/env")).env;
  }

  it("refuses a production build without the site's address", async () => {
    const env = await freshEnv({ NODE_ENV: "production", APP_URL: "" });
    expect(() => env()).toThrow(/APP_URL: set it to the live address/);
  });

  it("uses the address when it's set, and defaults to localhost only in development", async () => {
    expect((await freshEnv({ NODE_ENV: "production", APP_URL: "https://astitva.in" }))().APP_URL).toBe("https://astitva.in");
    expect((await freshEnv({ NODE_ENV: "development", APP_URL: "" }))().APP_URL).toBe("http://localhost:3000");
  });
});
