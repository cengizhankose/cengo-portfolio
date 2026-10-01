// PERF-03: a prerendered page keeps the copyright year of the day it was
// built; the browser's year can be a later one (a page built in December, read
// in January). The year in the menu footer is marked suppressHydrationWarning
// (src/header/index.jsx), so React corrects the text instead of discarding the
// server's markup for a mismatch.
import { act } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  drawPages,
  HYDRATION_MESSAGE,
  hydratePage,
} from "./hydrate-support.jsx";

let serverHtml;
beforeAll(() => {
  serverHtml = drawPages([["/", {}]]);
}, 60_000);

let errors;
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.map(String).join(" "));
  });
});

it("a page built in an earlier year hydrates without a mismatch and shows the current year", async () => {
  const stale = new Map(
    [...serverHtml].map(([key, html]) => [
      key,
      html.replace(/© \d{4}/, "© 2025"),
    ]),
  );
  const { container, marked, recoverable, root } = await hydratePage(
    "/",
    {},
    stale,
  );
  expect(recoverable).toEqual([]);
  expect(errors.filter((line) => HYDRATION_MESSAGE.test(line))).toEqual([]);
  expect(container.querySelector("h1")).toBe(marked.h1);
  await act(async () => root.unmount());
});
