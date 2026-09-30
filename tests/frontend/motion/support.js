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
 * callbacks that are queued now (one frame), `frames.pending()` counts them.
 */
export function stubFrames() {
  let nextId = 1;
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
      callbacks.forEach((callback) => callback(performance.now()));
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

/**
 * The declarations of a rule, looked up by its exact selector list inside
 * `css` (optionally inside the given @media block). Comments are ignored.
 */
export function rule(css, selector, media) {
  let source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (media) {
    const start = source.indexOf(`@media ${media}`);
    if (start < 0) return null;
    let depth = 0;
    let end = source.indexOf("{", start);
    for (let i = end; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    source = source.slice(source.indexOf("{", start) + 1, end);
  } else {
    // Top-level rules only: drop @media/@supports/@keyframes blocks.
    source = source.replace(
      /@[a-z-]+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
      "",
    );
  }
  const wanted = selector.replace(/\s+/g, " ").trim();
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .split(",")
      .map((part) => part.replace(/\s+/g, " ").trim());
    if (selectors.join(", ") !== wanted && !selectors.includes(wanted))
      continue;
    return Object.fromEntries(
      match[2]
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
  return null;
}
