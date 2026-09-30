// Local-tool database guard (K-02 = A; BE-04 and SEC-06 share this one guard).
//
// Local tools (the dev API, drizzle-kit, scripts/*) may only talk to a local
// development database: host localhost / 127.0.0.1 / ::1 (or, inside a
// container, the compose service `db`) AND a database name ending in `_dev` or
// `_test`. Anything else is refused unless the caller opts in explicitly with
// `--prod` (scripts) or ALLOW_REMOTE_DB=1 (tools that do not take our flags,
// e.g. drizzle-kit), both meant for `outplane env run ...` so production
// credentials never touch disk.
//
// The host is read the way postgres.js reads it (userinfo ends at the FIRST
// '@', a ',' makes a host list), not only with WHATWG `new URL()` (which ends
// userinfo at the LAST '@'): a URL the two parsers disagree on is refused.
//
// The production server (server.ts) and src/db/index.ts do not call the guard;
// src/db/tls.ts reuses `isLocalDbHost` for its plaintext check.
// Messages name only the database, never the host or the URL.
//
// Plain Node-compatible TypeScript: drizzle-kit loads it from drizzle.config.ts
// under Node, so no Bun-only APIs here.
import { existsSync } from "node:fs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
// Compose service names: only meaningful inside a container. On the host
// machine a bare `db` could resolve through a DNS search domain.
const CONTAINER_HOSTS = new Set(["db"]);
const DEV_DB_NAME = /_(dev|test)$/;
// libpq-style parsers honour these query parameters and can redirect the
// connection away from the host in the URL.
const HOST_OVERRIDE_PARAMS = ["host", "hostaddr"];

export const OVERRIDE_HINT = "pass --prod or set ALLOW_REMOTE_DB=1 explicitly";

type Env = Record<string, string | undefined>;

export function prodOverrideRequested(
  argv: readonly string[] = process.argv,
  env: Env = process.env,
): boolean {
  return argv.includes("--prod") || env.ALLOW_REMOTE_DB === "1";
}

/** True inside a Docker/Podman container, where the compose host `db` is the local database. */
export function runningInContainer(): boolean {
  return existsSync("/.dockerenv") || existsSync("/run/.containerenv");
}

export interface HostCheckOptions {
  /** Whether compose service names (`db`) count as local; defaults to runningInContainer(). */
  inContainer?: boolean;
}

export interface GuardOptions extends HostCheckOptions {
  /** Defaults to `--prod` in argv or ALLOW_REMOTE_DB=1 in the environment. */
  allowProd?: boolean;
  /** Where the override warning goes; defaults to console.warn. */
  warn?: (message: string) => void;
  /** Replaces OVERRIDE_HINT in the refusal (e.g. a tool that never allows an override). */
  hint?: string;
}

export interface GuardResult {
  database: string;
  local: boolean;
}

interface ParsedDbUrl {
  /** Lower-cased host exactly as postgres.js would dial it, or null when ambiguous. */
  host: string | null;
  database: string;
  redirectsHost: boolean;
}

// Only print names that look like a database identifier, so a malformed URL
// can never smuggle credentials into a log line.
function printable(name: string): string {
  return /^[A-Za-z0-9_.-]{1,63}$/.test(name) ? name : "<unprintable>";
}

/** The authority's host part as postgres.js derives it (src/index.js parseUrl), or null. */
function postgresJsHost(url: string, whatwgHostname: string): string | null {
  const authority = url.slice(url.indexOf("://") + 3).split(/[?/]/)[0];
  // More than one '@': WHATWG and postgres.js disagree on where the host starts.
  if (authority.split("@").length > 2) return null;
  let hostPart: string;
  try {
    hostPart = decodeURIComponent(authority.slice(authority.indexOf("@") + 1));
  } catch {
    return null;
  }
  // ',' is a multi-host list for postgres.js; '/' would be a Unix socket path.
  if (hostPart === "" || /[,/\\]/.test(hostPart)) return null;
  const host = hostPart.startsWith("[")
    ? hostPart.slice(0, hostPart.indexOf("]") + 1)
    : hostPart.split(":")[0];
  // Both parsers must name the same host.
  return host.toLowerCase() === whatwgHostname.toLowerCase()
    ? host.toLowerCase()
    : null;
}

function parseDbUrl(url: string): ParsedDbUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("PG_CONNECTION_URL is not a valid URL");
  }
  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    database = "";
  }
  return {
    host: postgresJsHost(url, parsed.hostname),
    database,
    redirectsHost: HOST_OVERRIDE_PARAMS.some((p) => parsed.searchParams.has(p)),
  };
}

function hostIsLocal(
  host: string | null,
  { inContainer = runningInContainer() }: HostCheckOptions,
): boolean {
  if (host === null) return false;
  return LOCAL_HOSTS.has(host) || (inContainer && CONTAINER_HOSTS.has(host));
}

/** True when `url` unambiguously points at a local database host (name not checked). */
export function isLocalDbHost(
  url: string,
  options: HostCheckOptions = {},
): boolean {
  try {
    const { host, redirectsHost } = parseDbUrl(url);
    return !redirectsHost && hostIsLocal(host, options);
  } catch {
    return false;
  }
}

export function assertNonProdDb(
  url: string | undefined = process.env.PG_CONNECTION_URL,
  {
    allowProd = prodOverrideRequested(),
    warn = console.warn,
    hint = OVERRIDE_HINT,
    inContainer,
  }: GuardOptions = {},
): GuardResult {
  if (!url) {
    throw new Error(
      "PG_CONNECTION_URL is not set (copy .env.example to .env for local development)",
    );
  }

  const { host, database, redirectsHost } = parseDbUrl(url);
  const local =
    hostIsLocal(host, { inContainer }) &&
    !redirectsHost &&
    DEV_DB_NAME.test(database);

  if (!local) {
    if (!allowProd) {
      throw new Error(
        `Refusing to use database "${printable(database)}" from a local tool: ` +
          `only localhost databases named *_dev or *_test are allowed; ${hint}`,
      );
    }
    warn(
      `[db-guard] override active: using non-local database "${printable(database)}"`,
    );
  }

  return { database, local };
}
