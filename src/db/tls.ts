// Database TLS policy (BE-13 / SEC-22). One place decides how the runtime
// talks TLS to Postgres; the publish CLI (W5) reuses the same checks.
//
//   PG_CA_CERT   PEM of a private CA: verify the chain against it (wins over PG_SSL_MODE)
//   PG_SSL_MODE  verify-full (default) | require (deliberate, temporary fallback:
//                encrypted but NOT verified) | disable (local compose database only)
//
// postgres.js lets an explicit `ssl` option override the URL's `sslmode`
// (src/index.js parseOptions: `k in o ? o[k] : query`), so the URL cannot
// silently weaken the connection. In production a weak `sslmode` in the URL is
// still refused, because other tools (drizzle-kit, the CLI) read the URL as is.
// Messages never contain the URL, the host or credentials.
import { isLocalDbHost, type HostCheckOptions } from "./guard";

export const SSL_MODES = ["verify-full", "require", "disable"] as const;
export type SslMode = (typeof SSL_MODES)[number];

/** Declared TLS setting (what dbOptions() reports, see src/db/config.ts). */
export type SslSetting =
  false | "require" | "verify-full" | { ca: string; rejectUnauthorized: true };

/** The concrete postgres.js `ssl` option. */
export type ClientSsl =
  false | "require" | { rejectUnauthorized: true; ca?: string };

type Env = Record<string, string | undefined>;

// libpq modes that do not verify the certificate (postgres.js also maps
// 'require'/'allow'/'prefer' to rejectUnauthorized=false).
const WEAK_URL_SSLMODE =
  /[?&]sslmode=(disable|allow|prefer|require|no-verify)(&|$)/i;

const explicitMode = (env: Env) => env.PG_SSL_MODE?.trim() || undefined;

/** PG_SSL_MODE, validated; unset or empty means verify-full. */
export function sslModeFromEnv(env: Env = process.env): SslMode {
  const raw = explicitMode(env);
  if (raw === undefined) return "verify-full";
  if ((SSL_MODES as readonly string[]).includes(raw)) return raw as SslMode;
  throw new Error(`PG_SSL_MODE must be one of: ${SSL_MODES.join(", ")}`);
}

/** BE-13: PG_CA_CERT first, then PG_SSL_MODE (`disable` -> false), default verify-full. */
export function sslSetting(env: Env = process.env): SslSetting {
  const ca = env.PG_CA_CERT?.trim();
  if (ca) return { ca, rejectUnauthorized: true };
  const mode = sslModeFromEnv(env);
  return mode === "disable" ? false : mode;
}

/**
 * The postgres.js option for a setting. 'verify-full' becomes an explicit
 * verifying TLS object (postgres.js sets servername to the host itself), so
 * the client's options state the verification (SEC-22).
 */
export function clientSsl(setting: SslSetting): ClientSsl {
  return setting === "verify-full" ? { rejectUnauthorized: true } : setting;
}

/** Log-friendly name of a setting; never includes the CA itself. */
export function describeSsl(setting: SslSetting): string {
  if (setting === false) return "disable";
  if (typeof setting === "string") return setting;
  return "verify-full+ca";
}

/**
 * SEC-22: with NODE_ENV=production the process must not start on a connection
 * that would skip certificate verification by accident:
 * - a URL with a weaker `sslmode` is refused unless PG_SSL_MODE is set
 *   explicitly (the documented override);
 * - `disable` (plaintext) is allowed only for a local database host, i.e. the
 *   compose `db` service used by the local production-image check.
 * Outside production nothing is enforced (local Docker DB has no TLS).
 */
export function assertProdTls(
  url: string,
  env: Env = process.env,
  hostOptions: HostCheckOptions = {},
): void {
  if (env.NODE_ENV !== "production") return;
  const setting = sslSetting(env);
  if (explicitMode(env) === undefined && WEAK_URL_SSLMODE.test(url)) {
    throw new Error(
      "Production DB URL must use sslmode=verify-full (it names a weaker sslmode); " +
        "fix the URL, or set PG_SSL_MODE=require only as a deliberate, temporary fallback",
    );
  }
  if (setting === false && !isLocalDbHost(url, hostOptions)) {
    throw new Error(
      "PG_SSL_MODE=disable is only allowed for a local database; " +
        "production connections need TLS with sslmode=verify-full",
    );
  }
}
