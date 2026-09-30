// BE-13 / SEC-22: postgres.js pool, timeouts and the TLS policy (pure checks).
import { describe, expect, test } from "bun:test";
import { clientConfig, dbOptions } from "../../../src/db/config";
import {
  assertProdTls,
  clientSsl,
  describeSsl,
  sslModeFromEnv,
  sslSetting,
} from "../../../src/db/tls";

const REMOTE =
  "postgres://someuser:not-a-real-secret@db.prod.invalid:5432/portfolio";
const PROD = { NODE_ENV: "production" };

describe("dbOptions (BE-13 criterion 1)", () => {
  test("defaults without PG_CA_CERT / PG_SSL_MODE", () => {
    const o = dbOptions({});
    expect(o.max).toBe(5);
    expect(o.idle_timeout).toBe(20);
    expect(o.connect_timeout).toBe(5);
    expect(o.max_lifetime).toBe(1800);
    expect(o.ssl).toBe("verify-full");
    expect(o.connection.statement_timeout).toBe(5000);
    expect(o.connection.application_name).toBe("cengo-portfolio");
  });

  test("PG_SSL_MODE=disable -> ssl false (local Docker DB)", () => {
    expect(dbOptions({ PG_SSL_MODE: "disable" }).ssl).toBe(false);
  });

  test("PG_SSL_MODE=require -> 'require' (emergency fallback)", () => {
    expect(dbOptions({ PG_SSL_MODE: "require" }).ssl).toBe("require");
  });

  test("empty PG_SSL_MODE means the default", () => {
    expect(dbOptions({ PG_SSL_MODE: "  " }).ssl).toBe("verify-full");
  });

  test("an unknown PG_SSL_MODE is refused", () => {
    expect(() => sslModeFromEnv({ PG_SSL_MODE: "prefer" })).toThrow(
      "PG_SSL_MODE must be one of: verify-full, require, disable",
    );
  });

  test("PG_CA_CERT verifies against that CA and wins over PG_SSL_MODE", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    expect(sslSetting({ PG_CA_CERT: pem, PG_SSL_MODE: "disable" })).toEqual({
      ca: pem,
      rejectUnauthorized: true,
    });
    expect(describeSsl(sslSetting({ PG_CA_CERT: pem }))).toBe("verify-full+ca");
  });
});

describe("clientConfig (what postgres.js receives)", () => {
  test("verify-full becomes an explicit verifying TLS object (SEC-22)", () => {
    const { options, summary } = clientConfig(
      `${REMOTE}?sslmode=verify-full`,
      PROD,
    );
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(summary).toEqual({ max: 5, ssl: "verify-full" });
  });

  test("disable and require pass through", () => {
    expect(clientSsl(false)).toBe(false);
    expect(clientSsl("require")).toBe("require");
  });

  test("the summary never contains the URL", () => {
    const { summary } = clientConfig(REMOTE, PROD);
    expect(JSON.stringify(summary)).not.toMatch(
      /someuser|secret|prod\.invalid/,
    );
  });
});

describe("assertProdTls (SEC-22)", () => {
  test.each(["disable", "allow", "prefer", "require", "no-verify"])(
    "production refuses a URL with sslmode=%s",
    (mode) => {
      let message = "";
      try {
        assertProdTls(`${REMOTE}?sslmode=${mode}`, PROD);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("verify-full");
      expect(message).not.toMatch(/someuser|not-a-real-secret|prod\.invalid/);
    },
  );

  test("production accepts sslmode=verify-full and a URL without sslmode", () => {
    expect(() =>
      assertProdTls(`${REMOTE}?sslmode=verify-full`, PROD),
    ).not.toThrow();
    expect(() => assertProdTls(REMOTE, PROD)).not.toThrow();
  });

  test("an explicit PG_SSL_MODE=require is the documented override", () => {
    expect(() =>
      assertProdTls(`${REMOTE}?sslmode=require`, {
        ...PROD,
        PG_SSL_MODE: "require",
      }),
    ).not.toThrow();
  });

  test("plaintext to a remote database is refused in production", () => {
    expect(() =>
      assertProdTls(REMOTE, { ...PROD, PG_SSL_MODE: "disable" }),
    ).toThrow("PG_SSL_MODE=disable is only allowed for a local database");
  });

  test("plaintext is allowed for the compose database (local production-image run)", () => {
    const composeUrl = "postgres://portfolio@db:5432/portfolio_dev";
    expect(() =>
      assertProdTls(
        composeUrl,
        { ...PROD, PG_SSL_MODE: "disable" },
        { inContainer: true },
      ),
    ).not.toThrow();
    expect(() =>
      assertProdTls(
        composeUrl,
        { ...PROD, PG_SSL_MODE: "disable" },
        { inContainer: false },
      ),
    ).toThrow();
  });

  test("outside production nothing is enforced", () => {
    expect(() => assertProdTls(`${REMOTE}?sslmode=disable`, {})).not.toThrow();
    expect(() =>
      assertProdTls(REMOTE, {
        NODE_ENV: "development",
        PG_SSL_MODE: "disable",
      }),
    ).not.toThrow();
  });
});
