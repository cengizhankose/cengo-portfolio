// BE-13 / SEC-22 on the wire and at process start, without a real Postgres:
// - a fake server that refuses TLS ('N') proves verify-full/require never fall
//   back to plaintext, and that `disable` sends our startup parameters;
// - spawning the entry points proves the production TLS guard and the
//   verifying client options (SEC-22 criteria 1-2).
import { afterEach, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { clientConfig } from "../../../src/db/config";
import { REPO_ROOT } from "./pglite";

const SSL_REQUEST_CODE = 80877103;
const PROTOCOL_3 = 196608;

interface Seen {
  sslRequest: boolean;
  tlsClientHello: boolean;
  plaintextStartup: Record<string, string> | null;
}

function parseStartupParams(body: Uint8Array): Record<string, string> {
  const parts = new TextDecoder().decode(body).split("\0");
  const params: Record<string, string> = {};
  for (let i = 0; i + 1 < parts.length && parts[i] !== ""; i += 2)
    params[parts[i]] = parts[i + 1];
  return params;
}

/** ErrorResponse ('E'), so the client rejects the query instead of reconnecting. */
function fatalError(message: string): Uint8Array {
  const fields = new TextEncoder().encode(`SFATAL\0C28000\0M${message}\0\0`);
  const out = new Uint8Array(5 + fields.byteLength);
  out[0] = "E".charCodeAt(0);
  new DataView(out.buffer).setInt32(1, 4 + fields.byteLength);
  out.set(fields, 5);
  return out;
}

/** A TCP server that answers the SSLRequest with 'N' and records what follows. */
function fakePostgres() {
  const seen: Seen = {
    sslRequest: false,
    tlsClientHello: false,
    plaintextStartup: null,
  };
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(socket, data) {
        const view = new DataView(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        );
        if (data.byteLength >= 8 && view.getInt32(4) === SSL_REQUEST_CODE) {
          seen.sslRequest = true;
          socket.write("N"); // "this server does not speak TLS"
          return;
        }
        if (data[0] === 0x16) {
          seen.tlsClientHello = true; // TLS handshake record
        } else if (data.byteLength >= 8 && view.getInt32(4) === PROTOCOL_3) {
          seen.plaintextStartup = parseStartupParams(data.subarray(8));
          socket.write(fatalError("fake server: startup recorded"));
        }
        socket.end();
      },
    },
  });
  return { seen, port: server.port, stop: () => server.stop(true) };
}

let cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});

async function trySelectOne(env: Record<string, string>) {
  const fake = fakePostgres();
  cleanup.push(fake.stop);
  const url = `postgres://tester@127.0.0.1:${fake.port}/portfolio_test`;
  const sql = postgres(url, clientConfig(url, env).options);
  let failed = false;
  try {
    await sql`select 1`;
  } catch {
    failed = true;
  } finally {
    await sql.end({ timeout: 0 });
  }
  return { failed, seen: fake.seen };
}

describe("TLS never degrades to plaintext (BE-13 criterion 4)", () => {
  test("verify-full against a server without TLS fails without a plaintext startup", async () => {
    const { failed, seen } = await trySelectOne({});
    expect(failed).toBe(true);
    expect(seen.sslRequest).toBe(true);
    expect(seen.plaintextStartup).toBeNull();
  });

  test("require behaves the same (encrypted or nothing)", async () => {
    const { failed, seen } = await trySelectOne({ PG_SSL_MODE: "require" });
    expect(failed).toBe(true);
    expect(seen.plaintextStartup).toBeNull();
  });

  test("disable (local Docker DB) sends our statement_timeout and application_name", async () => {
    const { seen } = await trySelectOne({ PG_SSL_MODE: "disable" });
    expect(seen.sslRequest).toBe(false);
    expect(seen.plaintextStartup).toMatchObject({
      user: "tester",
      database: "portfolio_test",
      statement_timeout: "5000",
      application_name: "cengo-portfolio",
    });
  });
});

// Minimal, explicit environment: nothing from the developer's shell or .env
// (empty values override a local .env, which Bun would otherwise load).
function spawnBun(args: string[], env: Record<string, string>) {
  const proc = Bun.spawnSync([process.execPath, ...args], {
    cwd: REPO_ROOT,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      PG_SSL_MODE: "",
      PG_CA_CERT: "",
      LOG_LEVEL: "",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000,
  });
  return {
    code: proc.exitCode,
    output: proc.stdout.toString() + proc.stderr.toString(),
  };
}

describe("process start (SEC-22 criteria 1-2)", () => {
  test("production server refuses sslmode=require before listening", () => {
    const { code, output } = spawnBun(["server.ts"], {
      NODE_ENV: "production",
      PORT: "0",
      PG_CONNECTION_URL: "postgres://u:p@db.example.com/x?sslmode=require",
    });
    expect(code).not.toBe(0);
    expect(output).toContain("verify-full");
    expect(output).not.toContain("u:p@");
    expect(output).not.toContain("db.example.com");
    expect(output).not.toContain('"server started"');
  });

  test("with sslmode=verify-full the read client verifies certificates", () => {
    const { code, output } = spawnBun(
      [
        "-e",
        "const m = await import('./src/db/index.ts'); console.log(m.readClient.options.ssl.rejectUnauthorized)",
      ],
      {
        NODE_ENV: "production",
        PG_CONNECTION_URL:
          "postgres://u:p@db.example.com/x?sslmode=verify-full",
      },
    );
    expect(code).toBe(0);
    expect(output.trim()).toBe("true");
  });
});
