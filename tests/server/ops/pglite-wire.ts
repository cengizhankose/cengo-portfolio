// A Postgres wire-protocol endpoint in front of an in-process PGlite, so a real
// postgres.js client (and a spawned `bun src/db/migrate.ts`) can be tested
// without Docker, a server or a network: it listens on 127.0.0.1 only.
//
// Framing follows the v3 protocol: the first message is an SSLRequest
// (answered 'N', no TLS) or the length-prefixed startup message; every later
// message is a type byte plus an int32 length. PGlite answers the messages,
// including authentication.
//
// Limits: PGlite is one backend, so every connection shares one session
// (advisory locks are re-entrant across "connections" here, so lock
// contention cannot be tested this way) and messages are handled one at a time.
import { PGlite } from "@electric-sql/pglite";
import { createServer, type AddressInfo, type Socket } from "node:net";

const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;
const CANCEL_REQUEST = 80877102;
const PROTOCOL_V3 = 196608;

export interface PgliteWire {
  db: PGlite;
  port: number;
  /** A URL the local-DB guard accepts (localhost, *_test name). */
  url: string;
  close(): Promise<void>;
}

export async function startPgliteWire(db = new PGlite()): Promise<PgliteWire> {
  await db.waitReady;
  const sockets = new Set<Socket>();

  const server = createServer((socket) => {
    sockets.add(socket);
    let buffer: Buffer = Buffer.alloc(0);
    let started = false;
    let chain = Promise.resolve();

    const handle = async () => {
      for (;;) {
        if (!started) {
          if (buffer.length < 8) return;
          const length = buffer.readInt32BE(0);
          const code = buffer.readInt32BE(4);
          if (code === SSL_REQUEST || code === GSSENC_REQUEST) {
            buffer = buffer.subarray(8);
            socket.write("N");
            continue;
          }
          if (code === CANCEL_REQUEST) {
            socket.end(); // cancellation is not supported
            return;
          }
          if (code !== PROTOCOL_V3) {
            socket.destroy();
            return;
          }
          if (buffer.length < length) return;
          started = true;
          await send(buffer.subarray(0, length));
          buffer = buffer.subarray(length);
          continue;
        }
        if (buffer.length < 5) return;
        const length = 1 + buffer.readInt32BE(1);
        if (buffer.length < length) return;
        const message = buffer.subarray(0, length);
        buffer = buffer.subarray(length);
        if (message[0] === 0x58 /* 'X' Terminate */) {
          socket.end();
          return;
        }
        await send(message);
      }
    };

    const send = (message: Buffer) =>
      db.runExclusive(() =>
        db.execProtocolRawStream(new Uint8Array(message), {
          onRawData: (data) => {
            if (!socket.destroyed) socket.write(Buffer.from(data));
          },
        }),
      );

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      chain = chain.then(handle).catch(() => {
        socket.destroy();
      });
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      sockets.delete(socket);
      // A client that vanished mid-transaction must not leave it open for the next one.
      chain = chain.then(async () => {
        if (db.isInTransaction()) await db.exec("rollback");
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;

  return {
    db,
    port,
    url: `postgres://postgres:postgres@127.0.0.1:${port}/portfolio_test`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}
