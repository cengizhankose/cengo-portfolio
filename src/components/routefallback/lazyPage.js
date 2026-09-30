// React.lazy for a page chunk, with a one-time reload when the chunk is gone
// (PERF-04 step 5, FE-05 step 4).
//
// After a deploy the chunk names in an already open tab are stale: the old
// hashed file is no longer on the server, the import() fails, and the page
// would land in the route error boundary. The new document points at the new
// files, so one reload fixes it. The reload happens at most once a minute per
// tab (a sessionStorage stamp, so a chunk that is really missing cannot cause
// a reload loop) and the stamp is cleared by the next chunk that loads. If the
// stamp cannot be written (storage blocked), nothing is reloaded and the error
// reaches the boundary, whose "Reload the page" button is the manual way out.
import { lazy } from "react";

export const RELOAD_STAMP_KEY = "chunk-reload-at";
export const RELOAD_WINDOW_MS = 60_000;

// Reading `sessionStorage` can itself throw (blocked site data), so it is only
// touched inside try/catch, never while the module loads.
function reloadOnce({ getStorage, reload, now }) {
  try {
    const storage = getStorage();
    const last = Number(storage.getItem(RELOAD_STAMP_KEY));
    if (last && now() - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_STAMP_KEY, String(now()));
  } catch {
    return false;
  }
  reload();
  return true;
}

function clearStamp(getStorage) {
  try {
    getStorage().removeItem(RELOAD_STAMP_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}

// The loader for React.lazy: `loader()` is the import(); a failure reloads the
// page once, otherwise it is thrown on to the error boundary. `options`
// (storage, reload, now) exist for tests.
export function guardedLoader(loader, options = {}) {
  const getStorage = () => options.storage ?? globalThis.sessionStorage;
  const reload = options.reload ?? (() => globalThis.location.reload());
  const now = options.now ?? Date.now;
  return async () => {
    try {
      const module = await loader();
      clearStamp(getStorage);
      return module;
    } catch (error) {
      // While the reload runs the promise never settles: the Suspense
      // fallback stays instead of flashing the error screen.
      if (reloadOnce({ getStorage, reload, now })) return new Promise(() => {});
      throw error;
    }
  };
}

export function lazyPage(loader, options) {
  return lazy(guardedLoader(loader, options));
}
