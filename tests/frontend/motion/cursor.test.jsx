// PERF-11 / FE-07 / DSG-21 (T-14): the cursor ring component on its own.
// - 3 listener registrations on mount, still 3 after 1,000 moves, 100 hover
//   events and 10 re-renders; the same 3 references are removed on unmount
//   and a pending frame is cancelled (the old library leaked ~18 listeners
//   per mouse move).
// - Moving the mouse never commits React (position is a ref + transform).
// - requestAnimationFrame runs only while the ring catches up, then stops.
import { act, render } from "@testing-library/react";
import { Profiler } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Cursor, { CLICKABLE } from "../../../src/components/Cursor.jsx";
import { pointer, spyPointerListeners, stubFrames } from "./support.js";

let frames;

beforeEach(() => {
  frames = stubFrames();
});

const ring = () => document.querySelector(".cursor-ring");
const move = (x, y, init = {}) =>
  window.dispatchEvent(
    pointer("pointermove", { clientX: x, clientY: y, ...init }),
  );

describe("listeners (PERF-11)", () => {
  it("keeps exactly 3 registrations through 1,000 moves, 100 hovers and 10 re-renders, and removes the same 3 on unmount", () => {
    const listeners = spyPointerListeners();
    const tree = () => (
      <>
        <a href="/about">About</a>
        <p>Text</p>
        <Cursor />
      </>
    );
    const { rerender, unmount, getByText } = render(tree());

    const added = listeners.added();
    expect(added.map(({ target, type }) => `${target}:${type}`).sort()).toEqual(
      ["document:pointerout", "document:pointerover", "window:pointermove"],
    );

    const link = getByText("About");
    const text = getByText("Text");
    for (let i = 0; i < 1000; i += 1) move(i % 400, (i * 7) % 300);
    for (let i = 0; i < 50; i += 1) {
      link.dispatchEvent(pointer("pointerover"));
      link.dispatchEvent(pointer("pointerout", { relatedTarget: text }));
    }
    for (let i = 0; i < 10; i += 1) rerender(tree());

    expect(listeners.added()).toHaveLength(3);
    expect(listeners.removed()).toHaveLength(0);

    // A frame is pending (the ring is still catching up) when unmounting.
    move(900, 900);
    expect(frames.pending()).toBe(1);
    const [pendingId] = frames.ids();
    unmount();

    const removed = listeners.removed();
    expect(removed).toHaveLength(3);
    for (const { target, type, listener } of added) {
      expect(removed).toContainEqual({ target, type, listener });
    }
    expect(frames.cancel).toHaveBeenCalledWith(pendingId);
  });
});

describe("rendering (PERF-11: no React commit per move)", () => {
  it("commits 0 times during 1,000 pointer moves", () => {
    const onRender = vi.fn();
    render(
      <Profiler id="cursor" onRender={onRender}>
        <Cursor />
      </Profiler>,
    );
    onRender.mockClear();

    act(() => {
      for (let i = 0; i < 1000; i += 1) {
        move(i, i);
        frames.run();
      }
    });

    expect(onRender).not.toHaveBeenCalled();
  });

  it("is one aria-hidden element and never touches the system cursor", () => {
    render(<Cursor />);
    move(10, 10);

    expect(document.querySelectorAll(".cursor-ring")).toHaveLength(1);
    expect(ring()).toHaveAttribute("aria-hidden", "true");
    expect(ring().childElementCount).toBe(0);
    expect(document.body.style.cursor).toBe("");
    expect(document.querySelectorAll('[style*="cursor"]')).toHaveLength(0);
  });
});

describe("frame loop (PERF-12: no idle requestAnimationFrame)", () => {
  it("starts on the pointer: the first move places the ring without a frame", () => {
    render(<Cursor />);
    expect(ring()).not.toHaveAttribute("data-visible");

    move(120, 80);

    expect(ring()).toHaveAttribute("data-visible");
    expect(ring().style.translate).toBe("120px 80px");
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("follows the pointer with one frame at a time and stops once settled", () => {
    render(<Cursor />);
    move(0, 0);
    move(100, 40);
    move(120, 50); // no second loop while one is running
    expect(frames.request).toHaveBeenCalledTimes(1);

    let steps = 0;
    while (frames.pending() && steps < 200) {
      frames.run();
      steps += 1;
    }

    expect(frames.pending()).toBe(0);
    expect(steps).toBeGreaterThan(5); // it eases in, not a jump
    expect(steps).toBeLessThan(60); // and settles in under a second at 60 Hz
    expect(ring().style.translate).toBe("120px 50px");

    // Idle: nothing is scheduled until the pointer moves again.
    const requests = frames.request.mock.calls.length;
    frames.run();
    expect(frames.request.mock.calls.length).toBe(requests);
  });

  it("ignores touch and pen input", () => {
    render(<Cursor />);
    move(50, 50, { pointerType: "touch" });
    move(60, 60, { pointerType: "pen" });

    expect(ring()).not.toHaveAttribute("data-visible");
    expect(ring().style.translate).toBe("");
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("hides when the pointer leaves the window and restarts on the pointer when it returns", () => {
    render(<Cursor />);
    move(10, 10);
    document.body.dispatchEvent(pointer("pointerout", { relatedTarget: null }));
    expect(ring()).not.toHaveAttribute("data-visible");

    move(300, 200);
    expect(ring()).toHaveAttribute("data-visible");
    expect(ring().style.translate).toBe("300px 200px");
  });
});

describe("hover state (DSG-21, one delegated listener pair)", () => {
  it("marks the ring over anything clickable and clears it when leaving", () => {
    const { getByText, getByRole } = render(
      <>
        <a href="/about">
          <span>About</span>
        </a>
        <button type="button">Menu</button>
        <p>Plain text</p>
        <Cursor />
      </>,
    );
    const span = getByText("About");
    const text = getByText("Plain text");
    move(1, 1);

    // Entering a child of a link counts as the link.
    span.dispatchEvent(pointer("pointerover"));
    expect(ring()).toHaveAttribute("data-hover");

    // Moving inside the same link keeps it.
    span.dispatchEvent(
      pointer("pointerout", { relatedTarget: span.parentElement }),
    );
    expect(ring()).toHaveAttribute("data-hover");

    span.dispatchEvent(pointer("pointerout", { relatedTarget: text }));
    expect(ring()).not.toHaveAttribute("data-hover");

    getByRole("button").dispatchEvent(pointer("pointerover"));
    expect(ring()).toHaveAttribute("data-hover");
  });

  it("covers the clickable elements the plan lists", () => {
    for (const selector of [
      "a",
      "button",
      '[role="button"]',
      "input",
      "select",
      "textarea",
      "label",
      "summary",
      "[data-cursor-hover]",
    ]) {
      expect(CLICKABLE.split(", ")).toContain(selector);
    }
  });
});
