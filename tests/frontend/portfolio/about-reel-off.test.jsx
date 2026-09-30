// About without the owner's video files (INTRO_REEL.published is false): no
// <video>, no empty section and no extra heading (MKT-18: the slot renders
// only when the files exist).
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INTRO_REEL } from "../../../src/content/projects.js";
import { About } from "../../../src/pages/about";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("About without the intro reel", () => {
  it("is off in the registry", () => {
    expect(INTRO_REEL.published).toBe(false);
  });

  it("renders no video, no reel section and the usual eight h2", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <About />
      </MemoryRouter>,
    );

    expect(document.querySelector("video, track, #reel")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(8);
    expect(document.body.textContent).not.toContain("Intro reel");
  });
});
