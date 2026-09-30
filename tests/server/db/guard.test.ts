// BE-04 / SEC-06: one guard for every local tool.
import { describe, expect, test } from "bun:test";
import { assertNonProdDb, prodOverrideRequested } from "../../../src/db/guard";

const noWarn = () => {};
const strict = { allowProd: false, warn: noWarn };

describe("assertNonProdDb", () => {
  test.each([
    "postgres://portfolio@localhost:5432/portfolio_dev",
    "postgres://portfolio@127.0.0.1:5432/portfolio_dev",
    "postgres://portfolio@[::1]:5432/portfolio_test",
    "postgresql://portfolio@LOCALHOST/portfolio_dev",
    "postgres://portfolio@db:5432/portfolio_dev",
  ])("accepts local dev database %s", (url) => {
    const result = assertNonProdDb(url, strict);
    expect(result.local).toBe(true);
    expect(result.database).toMatch(/_(dev|test)$/);
  });

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
