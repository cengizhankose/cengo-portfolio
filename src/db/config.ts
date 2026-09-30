// postgres.js client settings (BE-13). Explicit pool and timeout values
// instead of the library defaults (max 10, no idle timeout, 30 s connect,
// no statement timeout); TLS comes from src/db/tls.ts (SEC-22).
//
// Connection budget (T-13): the managed Postgres instance also hosts Umami's
// database. Portfolio side: 2 x max (two instances during a rolling deploy)
// + 1 migrate + 1 CLI/admin session. The owner checks the full budget against
// max_connections (see the BE-13 plan) before Umami goes live.
import {
  assertProdTls,
  clientSsl,
  describeSsl,
  sslSetting,
  type ClientSsl,
  type SslSetting,
} from "./tls";
import type { HostCheckOptions } from "./guard";

type Env = Record<string, string | undefined>;

export const DB_APPLICATION_NAME = "cengo-portfolio";
export const STATEMENT_TIMEOUT_MS = 5000;

export interface DbOptions<Ssl> {
  max: number;
  idle_timeout: number;
  max_lifetime: number;
  connect_timeout: number;
  ssl: Ssl;
  connection: { statement_timeout: number; application_name: string };
}

/** Declared settings (BE-13 criteria); `ssl` is the mode, e.g. 'verify-full'. */
export function dbOptions(env: Env = process.env): DbOptions<SslSetting> {
  return {
    max: 5,
    idle_timeout: 20, // seconds; idle connections close instead of lingering
    max_lifetime: 60 * 30, // seconds; recycle connections every 30 min
    connect_timeout: 5, // seconds
    ssl: sslSetting(env),
    connection: {
      // Server-side cap per statement; applies only to this application's
      // sessions (application_name), not to Umami on the same instance.
      statement_timeout: STATEMENT_TIMEOUT_MS,
      application_name: DB_APPLICATION_NAME,
    },
  };
}

export interface ClientConfig {
  /** Options for `postgres(url, options)`. */
  options: DbOptions<ClientSsl>;
  /** Safe to log: pool size and TLS mode, never the URL. */
  summary: { max: number; ssl: string };
}

/** Validates the TLS policy for `url` (SEC-22) and returns the postgres.js options. */
export function clientConfig(
  url: string,
  env: Env = process.env,
  hostOptions: HostCheckOptions = {},
): ClientConfig {
  assertProdTls(url, env, hostOptions);
  const declared = dbOptions(env);
  return {
    options: { ...declared, ssl: clientSsl(declared.ssl) },
    summary: { max: declared.max, ssl: describeSsl(declared.ssl) },
  };
}
