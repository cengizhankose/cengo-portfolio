// Shared helpers for tests/frontend/motion/** (not a test file itself).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "@testing-library/react";
import { vi } from "vitest";

export const ROOT = join(import.meta.dirname, "..", "..", "..");
export const read = (file) => readFileSync(join(ROOT, file), "utf8");

const DEFAULT_MEDIA = {
  hover: "hover",
  pointer: "fine",
  "prefers-reduced-motion": "no-preference",
  "prefers-color-scheme": "dark",
};

/**
 * A controllable matchMedia that evaluates `(feature: value) and ...` queries
 * against one device state, like a browser: `stubMedia({ pointer: 'coarse' })`
 * is a touch phone, `{ 'prefers-reduced-motion': 'reduce' }` the OS setting.
 * `media.set({...})` changes the state and fires "change" on every
 * MediaQueryList whose answer changed. `media.listeners()` counts the change
 * listeners still attached (cleanup checks).
 */
export function stubMedia(initial = {}) {
  let state = { ...DEFAULT_MEDIA, ...initial };
  const lists = [];

  const evaluate = (query) =>
    query
      .split(/\s+and\s+/)
      .map((part) => /^\(\s*([a-z-]+)\s*:\s*([a-z-]+)\s*\)$/.exec(part.trim()))
      .every((match) => match && state[match[1]] === match[2]);

  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const listeners = new Set();
    const list = {
      media: query,
      onchange: null,
      get matches() {
        return evaluate(query);
      },
      addEventListener: (type, listener) => {
        if (type === "change") listeners.add(listener);
      },
      removeEventListener: (type, listener) => {
        if (type === "change") listeners.delete(listener);
      },
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
      dispatchEvent: () => false,
      listeners,
    };
    lists.push(list);
    return list;
  });

  return {
    set(next) {
      const before = lists.map((list) => list.matches);
      state = { ...state, ...next };
      act(() => {
        lists.forEach((list, index) => {
          if (list.matches === before[index]) return;
          const event = { matches: list.matches, media: list.media };
          for (const listener of [...list.listeners]) listener(event);
        });
      });
    },
    listeners: () =>
      lists.reduce((total, list) => total + list.listeners.size, 0),
  };
}

/** A pointer event the way Chrome sends it for a mouse (or `pointerType`). */
export function pointer(type, init = {}) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: "mouse",
    ...init,
  });
}

/**
 * requestAnimationFrame under test control: `frames.run()` runs the frame
 * callbacks that are queued now (one frame, `frameMs` after the previous
 * one on a virtual clock), `frames.pending()` counts them.
 */
export function stubFrames({ frameMs = 1000 / 60 } = {}) {
  let nextId = 1;
  let clock = 1000;
  const queue = new Map();
  const request = vi.fn((callback) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id) => queue.delete(id));
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    request,
    cancel,
    pending: () => queue.size,
    ids: () => [...queue.keys()],
    run() {
      const callbacks = [...queue.values()];
      queue.clear();
      clock += frameMs;
      callbacks.forEach((callback) => callback(clock));
    },
  };
}

/**
 * Spies on window/document add- and removeEventListener and returns the
 * pointer-event registrations (React adds its own listeners on the root
 * container, and "selectionchange" on the document; those are not ours).
 */
export function spyPointerListeners() {
  const spies = {
    windowAdd: vi.spyOn(window, "addEventListener"),
    windowRemove: vi.spyOn(window, "removeEventListener"),
    documentAdd: vi.spyOn(document, "addEventListener"),
    documentRemove: vi.spyOn(document, "removeEventListener"),
  };
  const pointerCalls = (spy, target) =>
    spy.mock.calls
      .filter(([type]) => type.startsWith("pointer"))
      .map(([type, listener]) => ({ target, type, listener }));
  return {
    added: () => [
      ...pointerCalls(spies.windowAdd, "window"),
      ...pointerCalls(spies.documentAdd, "document"),
    ],
    removed: () => [
      ...pointerCalls(spies.windowRemove, "window"),
      ...pointerCalls(spies.documentRemove, "document"),
    ],
  };
}

// A small CSS block parser: comments dropped, at-rules keep their children,
// style rules keep their declaration text.
function parseBlocks(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const parseList = () => {
    const items = [];
    let prelude = "";
    while (i < src.length) {
      const char = src[i];
      i += 1;
      if (char === "}") return items;
      if (char === ";" && prelude.trim().startsWith("@")) {
        prelude = ""; // @import and other statement at-rules
      } else if (char !== "{") {
        prelude += char;
      } else if (prelude.trim().startsWith("@")) {
        items.push({
          at: prelude.replace(/\s+/g, " ").trim(),
          children: parseList(),
        });
        prelude = "";
      } else {
        const end = src.indexOf("}", i);
        items.push({
          selector: prelude.replace(/\s+/g, " ").trim(),
          body: src.slice(i, end),
        });
        i = end + 1;
        prelude = "";
      }
    }
    return items;
  };
  return parseList();
}

/**
 * The declarations of the first rule whose selector list is `selector` (or
 * contains it), at the top level of `css` or inside the given at-rules:
 * `rule(css, ".a", "(max-width: 10px)", "@supports (x: y)")`. A condition
 * without "@" means "@media <condition>"; every matching block is searched.
 */
export function rule(css, selector, ...atRules) {
  let scopes = [parseBlocks(css)];
  for (const at of atRules) {
    const name = at.startsWith("@") ? at : `@media ${at}`;
    scopes = scopes.flatMap((items) =>
      items.filter((item) => item.at === name).map((item) => item.children),
    );
  }
  const wanted = selector.replace(/\s+/g, " ").trim();
  for (const items of scopes) {
    for (const item of items) {
      if (!item.selector) continue;
      const selectors = item.selector.split(",").map((part) => part.trim());
      if (selectors.join(", ") !== wanted && !selectors.includes(wanted))
        continue;
      return Object.fromEntries(
        item.body
          .split(";")
          .map((decl) => decl.trim())
          .filter(Boolean)
          .map((decl) => {
            const colon = decl.indexOf(":");
            return [
              decl.slice(0, colon).trim(),
              decl
                .slice(colon + 1)
                .replace(/\s+/g, " ")
                .trim(),
            ];
          }),
      );
    }
  }
  return null;
}
