import { describe, expect, it } from "vitest";
import { sslFromEnv } from "@/db/ssl";

const supabase = "postgresql://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

describe("database TLS", () => {
  it("uses no TLS for a local database", () => {
    expect(sslFromEnv("postgres://u:p@localhost:5432/db", {})).toBe(false);
  });

  it("uses no TLS for a local database even when the Supabase CA is configured", () => {
    expect(sslFromEnv("postgres://localhost:5432/astitva_test", { DATABASE_CA_CERT: PEM })).toBe(false);
  });

  it("verifies the server against the configured CA", () => {
    expect(sslFromEnv(supabase, { DATABASE_CA_CERT: PEM })).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it("accepts a CA with escaped newlines, as some hosts store env vars", () => {
    const ssl = sslFromEnv(supabase, { DATABASE_CA_CERT: PEM.replace(/\n/g, "\\n") });
    expect(ssl && ssl.ca).toBe(PEM);
  });

  it("refuses a remote database without a CA instead of connecting in plain text", () => {
    expect(() => sslFromEnv(supabase, {})).toThrow(/no CA certificate/);
  });

  it("explains what to do when sslmode is in the URL", () => {
    expect(() => sslFromEnv(`${supabase}?sslmode=require`, {})).toThrow(/Remove sslmode/);
  });

  it("says what to fix when a local certificate path reaches a host, or the inline value isn't a certificate", () => {
    const supabase = "postgresql://u:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
    expect(() => sslFromEnv(supabase, { DATABASE_CA_CERT_FILE: "certs/missing.crt" })).toThrow(/set DATABASE_CA_CERT to the certificate's text/);
    expect(() => sslFromEnv(supabase, { DATABASE_CA_CERT: "certs/supabase-ca.crt" })).toThrow(/must be the certificate's text/);
    // The inline certificate wins over a stale file path.
    expect(sslFromEnv(supabase, { DATABASE_CA_CERT: PEM, DATABASE_CA_CERT_FILE: "certs/missing.crt" })).toEqual({ ca: PEM, rejectUnauthorized: true });
  });
});
