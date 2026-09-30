// Local-tool database guard (K-02 = A; BE-04 and SEC-06 share this one guard).
//
// Local tools (the dev API, drizzle-kit, scripts/*) may only talk to a local
// development database: host localhost / 127.0.0.1 / ::1 (or the compose
// service `db`) AND a database name ending in `_dev` or `_test`. Anything else
// is refused unless the caller opts in explicitly with `--prod` (scripts) or
// ALLOW_REMOTE_DB=1 (tools that do not take our flags, e.g. drizzle-kit), both
// meant for `outplane env run ...` so production credentials never touch disk.
//
// The production server (server.ts) and src/db/index.ts do not call this.
// Messages name only the database, never the host or the URL.
//
// Plain Node-compatible TypeScript: drizzle-kit loads it from drizzle.config.ts
// under Node, so no Bun-only APIs here.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db"]);
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

export interface GuardOptions {
  /** Defaults to `--prod` in argv or ALLOW_REMOTE_DB=1 in the environment. */
  allowProd?: boolean;
  /** Where the override warning goes; defaults to console.warn. */
  warn?: (message: string) => void;
}

export interface GuardResult {
  database: string;
  local: boolean;
}

// Only print names that look like a database identifier, so a malformed URL
// can never smuggle credentials into a log line.
function printable(name: string): string {
  return /^[A-Za-z0-9_.-]{1,63}$/.test(name) ? name : "<unprintable>";
}

export function assertNonProdDb(
  url: string | undefined = process.env.PG_CONNECTION_URL,
  {
    allowProd = prodOverrideRequested(),
    warn = console.warn,
  }: GuardOptions = {},
): GuardResult {
  if (!url) {
    throw new Error(
      "PG_CONNECTION_URL is not set (copy .env.example to .env for local development)",
    );
  }

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

  const hostIsLocal = LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  const redirectsHost = HOST_OVERRIDE_PARAMS.some((p) =>
    parsed.searchParams.has(p),
  );
  const nameIsDev = DEV_DB_NAME.test(database);
  const local = hostIsLocal && !redirectsHost && nameIsDev;

  if (!local) {
    if (!allowProd) {
      throw new Error(
        `Refusing to use database "${printable(database)}" from a local tool: ` +
          `only localhost databases named *_dev or *_test are allowed; ${OVERRIDE_HINT}`,
      );
    }
    warn(
      `[db-guard] override active: using non-local database "${printable(database)}"`,
    );
  }

  return { database, local };
}
