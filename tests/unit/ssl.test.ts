import { describe, expect, it } from "vitest";
import { normalisePem, sslFromEnv, withoutSslParams } from "@/db/ssl";

const supabase = "postgresql://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";
/** A throwaway self-signed test certificate (no key kept): real enough to parse, trusted by nothing. */
const PEM = "-----BEGIN CERTIFICATE-----\nMIIBgDCCASagAwIBAgIUbknXppaYNUJChOaGqqmvZT5Yi68wCgYIKoZIzj0EAwIw\nJTEjMCEGA1UEAwwaYXN0aXR2YSB0ZXN0IENBIChub3QgcmVhbCkwIBcNMjYxMDIx\nMDQ0NzEzWhgPMjEyNjA5MjcwNDQ3MTNaMCUxIzAhBgNVBAMMGmFzdGl0dmEgdGVz\ndCBDQSAobm90IHJlYWwpMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvR1D2phP\nK8yXWlHR59lMU/TZb7m8hBm6nk+tZAfmHqY9nKnn+/am1z6b5Td5Y1XJOHXLskq6\n9GG/Ad4VUOY0IqMyMDAwHQYDVR0OBBYEFM8J2MGberZDjAITpfLBUuygCQSUMA8G\nA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhAM4+B7iuyhKW78KYMt/Y\nSJb3P7qRu6cvjwdK5YfGqxrrAiBL9pfjmddIYbMfSVOOst2113GuM/NBY1z8bhVH\n+Ph55Q==\n-----END CERTIFICATE-----\n";

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

  it("drops TLS options from the URL so they can't replace full verification", () => {
    expect(withoutSslParams(`${supabase}?sslmode=require&pgbouncer=true&sslrootcert=x.crt`)).toBe(`${supabase}?pgbouncer=true`);
    expect(withoutSslParams(supabase)).toBe(supabase);
  });

  it("says what to fix when a local certificate path reaches a host, or the inline value isn't a certificate", () => {
    const supabase = "postgresql://u:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
    expect(() => sslFromEnv(supabase, { DATABASE_CA_CERT_FILE: "certs/missing.crt" })).toThrow(/set DATABASE_CA_CERT to the certificate's text/);
    expect(() => sslFromEnv(supabase, { DATABASE_CA_CERT: "certs/supabase-ca.crt" })).toThrow(/must be the certificate's text/);
    // The inline certificate wins over a stale file path.
    expect(sslFromEnv(supabase, { DATABASE_CA_CERT: PEM, DATABASE_CA_CERT_FILE: "certs/missing.crt" })).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it("reads the certificate however it was pasted into a host's settings", () => {
    const pasted = [
      PEM,
      PEM.replace(/\n/g, "\\n"), // typed as \n
      PEM.replace(/\n/g, " "), // line breaks turned into spaces
      PEM.replace(/\n/g, ""), // line breaks lost
      `"${PEM.trim()}"`, // wrapped in quotes
      PEM.replace(/\n/g, "\r\n"), // Windows line breaks
    ];
    for (const raw of pasted) expect(normalisePem(raw)).toBe(PEM);
  });

  it("says plainly when the certificate is damaged, instead of a misleading TLS error", () => {
    const cut = PEM.replace(/(-----BEGIN CERTIFICATE-----\n.{20})[\s\S]*?(-----END)/, "$1\n$2");
    expect(() => normalisePem(cut)).toThrow(/isn't a readable certificate/);
    expect(() => normalisePem("certs/supabase-ca.crt")).toThrow(/must be the certificate's text/);
  });
});
