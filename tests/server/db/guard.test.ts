// BE-04 / SEC-06: one guard for every local tool.
import { describe, expect, test } from "bun:test";
import postgres from "postgres";
import {
  assertNonProdDb,
  isLocalDbHost,
  prodOverrideRequested,
} from "../../../src/db/guard";

const noWarn = () => {};
// inContainer pinned so results do not depend on where the tests run.
const strict = { allowProd: false, warn: noWarn, inContainer: false };

const ACCEPTED = [
  "postgres://portfolio@localhost:5432/portfolio_dev",
  "postgres://portfolio@127.0.0.1:5432/portfolio_dev",
  "postgres://portfolio@[::1]:5432/portfolio_test",
  "postgresql://portfolio@LOCALHOST/portfolio_dev",
  "postgres://a%40b@localhost/portfolio_dev",
];

describe("assertNonProdDb", () => {
  test.each(ACCEPTED)("accepts local dev database %s", (url) => {
    const result = assertNonProdDb(url, strict);
    expect(result.local).toBe(true);
    expect(result.database).toMatch(/_(dev|test)$/);
  });

  test("the compose host `db` is local only inside a container", () => {
    const url = "postgres://portfolio@db:5432/portfolio_dev";
    expect(assertNonProdDb(url, { ...strict, inContainer: true }).local).toBe(
      true,
    );
    expect(() => assertNonProdDb(url, strict)).toThrow(
      'Refusing to use database "portfolio_dev"',
    );
  });

  // W1 review: WHATWG URL ends userinfo at the LAST '@', postgres.js at the
  // FIRST '@' and splits hosts on ','. Every URL the parsers read differently
  // is refused.
  test.each([
    [
      "first-@ vs last-@ split",
      "postgres://a@db.prod.invalid,b@localhost/portfolio_dev",
    ],
    [
      "two '@' in the authority",
      "postgres://a@db.prod.invalid@localhost/portfolio_dev",
    ],
    [
      "encoded comma host list",
      "postgres://u@db.prod.invalid%2Clocalhost/portfolio_dev",
    ],
    [
      "encoded host that decodes to localhost",
      "postgres://u@local%68ost/portfolio_dev",
    ],
    ["unix socket path host", "postgres://u@%2Ftmp/portfolio_dev"],
  ])("refuses a parser-ambiguous URL: %s", (_label, url) => {
    expect(() => assertNonProdDb(url, strict)).toThrow(
      'Refusing to use database "portfolio_dev"',
    );
    expect(isLocalDbHost(url, { inContainer: true })).toBe(false);
  });

  test("the W1 probe really would dial the remote host with postgres.js", () => {
    const probe = "postgres://a@db.prod.invalid,b@localhost/portfolio_dev";
    const sql = postgres(probe, { max: 1 });
    expect(sql.options.host[0]).toBe("db.prod.invalid");
    void sql.end({ timeout: 0 });
  });

  test.each(ACCEPTED)(
    "postgres.js dials only a local host for accepted %s",
    (url) => {
      const sql = postgres(url, { max: 1 });
      for (const host of sql.options.host)
        expect(["localhost", "127.0.0.1", "["]).toContain(host.toLowerCase());
      void sql.end({ timeout: 0 });
    },
  );

  test.each([
    [
      "non-local host",
      "postgres://u:p@db.prod.invalid:5432/portfolio_dev",
      "portfolio_dev",
    ],
    [
      "production-like name on localhost",
      "postgres://x:y@127.0.0.1:1/prod",
      "prod",
    ],
    [
      "plain name on localhost",
      "postgres://portfolio@localhost:5432/portfolio",
      "portfolio",
    ],
    [
      "empty host (would fall back to PGHOST)",
      "postgres:///portfolio_dev",
      "portfolio_dev",
    ],
    [
      "multi-host list",
      "postgres://u@localhost,db.prod.invalid/portfolio_dev",
      "portfolio_dev",
    ],
    [
      "host query override",
      "postgres://u@localhost/portfolio_dev?host=db.prod.invalid",
      "portfolio_dev",
    ],
    [
      "hostaddr query override",
      "postgres://u@localhost/portfolio_dev?hostaddr=203.0.113.9",
      "portfolio_dev",
    ],
    [
      "dev suffix not at the end",
      "postgres://u@localhost/portfolio_dev_copy",
      "portfolio_dev_copy",
    ],
  ])("refuses %s", (_label, url, name) => {
    expect(() => assertNonProdDb(url, strict)).toThrow(
      `Refusing to use database "${name}"`,
    );
  });

  test("error names the override and never the host or credentials", () => {
    let message = "";
    try {
      assertNonProdDb(
        "postgres://someuser:s3cret-value@db.prod.invalid:5432/x",
        strict,
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('Refusing to use database "x"');
    expect(message).toContain("ALLOW_REMOTE_DB=1");
    expect(message).toContain("--prod");
    expect(message).not.toContain("db.prod.invalid");
    expect(message).not.toContain("someuser");
    expect(message).not.toContain("s3cret-value");
  });

  test("does not echo an unprintable database name", () => {
    expect(() =>
      assertNonProdDb("postgres://u@db.prod.invalid/a%20b%3Bc", strict),
    ).toThrow('Refusing to use database "<unprintable>"');
  });

  test("missing or malformed URL is refused without echoing it", () => {
    const saved = process.env.PG_CONNECTION_URL;
    delete process.env.PG_CONNECTION_URL;
    try {
      expect(() => assertNonProdDb(undefined, strict)).toThrow(
        "PG_CONNECTION_URL is not set",
      );
    } finally {
      if (saved !== undefined) process.env.PG_CONNECTION_URL = saved;
    }
    expect(() => assertNonProdDb("", strict)).toThrow(
      "PG_CONNECTION_URL is not set",
    );
    expect(() =>
      assertNonProdDb("not a url with secret-token", strict),
    ).toThrow(/^PG_CONNECTION_URL is not a valid URL$/);
  });

  test("explicit override allows a remote database and warns with the name only", () => {
    const warnings: string[] = [];
    const result = assertNonProdDb(
      "postgres://u:p@db.prod.invalid:5432/portfolio",
      {
        allowProd: true,
        warn: (m) => warnings.push(m),
      },
    );
    expect(result).toEqual({ database: "portfolio", local: false });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"portfolio"');
    expect(warnings[0]).not.toContain("db.prod.invalid");
  });

  test("override flag is not needed (and no warning) for a local dev database", () => {
    const warnings: string[] = [];
    assertNonProdDb("postgres://u@localhost/portfolio_dev", {
      allowProd: true,
      warn: (m) => warnings.push(m),
    });
    expect(warnings).toHaveLength(0);
  });

  test("a tool-specific hint replaces the override advice", () => {
    expect(() =>
      assertNonProdDb("postgres://u@db.prod.invalid/portfolio_dev", {
        ...strict,
        hint: "seeding never targets a remote database",
      }),
    ).toThrow(/; seeding never targets a remote database$/);
  });
});

describe("isLocalDbHost (used by the production TLS check)", () => {
  test.each([
    ["postgres://u@localhost/x", true],
    ["postgres://u:p@127.0.0.1:5432/anything", true],
    ["postgres://u@db.prod.invalid/x_dev", false],
    ["postgres://u@localhost/x?host=db.prod.invalid", false],
    ["not a url", false],
  ])("%s -> %p", (url, expected) => {
    expect(isLocalDbHost(url as string, { inContainer: false })).toBe(
      expected as boolean,
    );
  });
});

describe("prodOverrideRequested (--prod == ALLOW_REMOTE_DB=1)", () => {
  test("--prod flag", () => {
    expect(prodOverrideRequested(["bun", "script.ts", "--prod"], {})).toBe(
      true,
    );
  });
  test("ALLOW_REMOTE_DB=1", () => {
    expect(
      prodOverrideRequested(["bun", "script.ts"], { ALLOW_REMOTE_DB: "1" }),
    ).toBe(true);
  });
  test("anything else is not an override", () => {
    expect(prodOverrideRequested(["bun", "script.ts"], {})).toBe(false);
    expect(
      prodOverrideRequested(["bun", "script.ts", "--production"], {
        ALLOW_REMOTE_DB: "true",
      }),
    ).toBe(false);
  });
});
