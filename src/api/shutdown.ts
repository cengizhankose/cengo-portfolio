// Graceful shutdown (BE-21). On SIGTERM/SIGINT: stop accepting connections,
// let in-flight requests finish (Bun's server.stop()), close the DB pool,
// exit 0. A hung step cannot keep the process alive: after `forceExitAfterMs`
// it exits 1. `isShuttingDown()` flips first, so /ready answers 503 meanwhile.
import { errorFields, log } from "./log";

export interface ShutdownDeps {
  /** Stops listening and resolves when in-flight requests are done. */
  stopServer: () => Promise<void>;
  /** Closes the database pool. */
  closeDb: () => Promise<void>;
  exit: (code: number) => void;
  /** Upper bound for the whole shutdown; default 10 s. */
  forceExitAfterMs?: number;
}

export interface Shutdown {
  isShuttingDown: () => boolean;
  shutdown: (signal: string) => Promise<void>;
}

export function createShutdown({
  stopServer,
  closeDb,
  exit,
  forceExitAfterMs = 10_000,
}: ShutdownDeps): Shutdown {
  let shuttingDown = false;
  return {
    isShuttingDown: () => shuttingDown,
    async shutdown(signal) {
      if (shuttingDown) return;
      shuttingDown = true;
      log("info", "shutdown start", { signal });
      const force = setTimeout(() => {
        log("error", "shutdown timed out", {
          signal,
          afterMs: forceExitAfterMs,
        });
        exit(1);
      }, forceExitAfterMs);
      (force as { unref?: () => void }).unref?.();
      try {
        await stopServer();
        await closeDb();
        clearTimeout(force);
        log("info", "shutdown complete", { signal });
        exit(0);
      } catch (error) {
        clearTimeout(force);
        log("error", "shutdown failed", { signal, ...errorFields(error) });
        exit(1);
      }
    },
  };
}
