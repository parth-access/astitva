import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";

/**
 * TLS settings for Postgres, from the environment.
 *
 * Supabase signs its database certificates with its own root CA, which Node
 * does not trust by default. Download it from the Supabase dashboard
 * (Project Settings → Database → SSL configuration) and provide it as either:
 *   DATABASE_CA_CERT_FILE=/path/to/prod-ca-2021.crt   (local)
 *   DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----..." (Netlify / CI)
 *
 * Do not put `sslmode=` in DATABASE_URL: node-postgres lets the URL override
 * these settings, and it treats `sslmode=require` as full verification
 * without the CA, so the connection fails.
 */
export function sslFromEnv(connectionString: string, env: Partial<Record<string, string>> = process.env): false | ConnectionOptions {
  // A local database (dev, the integration test database) never uses TLS, even
  // when the Supabase CA is configured for DATABASE_URL in the same environment.
  const host = new URL(connectionString).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  if (isLocal) return false;

  const inline = env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  const file = env.DATABASE_CA_CERT_FILE?.trim();
  const ca = inline || (file ? readFileSync(file, "utf8") : undefined);
  if (ca) return { ca, rejectUnauthorized: true };

  if (/sslmode=/i.test(connectionString)) {
    throw new Error("Remove sslmode from DATABASE_URL and set DATABASE_CA_CERT_FILE or DATABASE_CA_CERT instead (see src/db/ssl.ts).");
  }
  // A remote database without a CA: refuse rather than send customer data in plain text.
  throw new Error(
    `DATABASE_URL points at ${host} but no CA certificate is configured. Set DATABASE_CA_CERT_FILE or DATABASE_CA_CERT (see src/db/ssl.ts).`,
  );
}
