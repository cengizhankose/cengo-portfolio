// FE-02 (K-11): the side strip and the menu footer render the same six
// channels, in the same order, from one list; every link has a name.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SOCIAL_PROFILE_URLS as socialprofils } from "../../../src/components/socialicons";
import { Socialicons } from "../../../src/components/socialicons";
import {
  getSocialLinks,
  SOCIAL_CHANNELS,
  SOCIAL_ICONS,
} from "../../../src/components/socialicons/icons";
import Headermain from "../../../src/header";

// K-11, in this order; Facebook is not a channel any more.
const K11_IDS = ["linkedin", "github", "x", "youtube", "twitch", "instagram"];
const K11_LABELS = [
  "LinkedIn",
  "GitHub",
  "X",
  "YouTube",
  "Twitch",
  "Instagram",
];

// import.meta.url is not a file: URL under the jsdom environment.
const ROOT = resolve(import.meta.dirname, "../../..");

describe("social channel list (icons.js)", () => {
  it("lists the K-11 channels in order with brand-name labels", () => {
    expect(SOCIAL_CHANNELS.map(({ id }) => id)).toEqual(K11_IDS);
    expect(SOCIAL_CHANNELS.map(({ label }) => label)).toEqual(K11_LABELS);
  });

  it("has an icon component for every K-11 id and the legacy twitter key", () => {
    for (const id of [...K11_IDS, "twitter"]) {
      expect(SOCIAL_ICONS[id], id).toBeTypeOf("function");
    }
    expect(SOCIAL_ICONS.twitter).toBe(SOCIAL_ICONS.x);
    expect(SOCIAL_ICONS).not.toHaveProperty("facebook");
  });

  it("resolves today's socialprofils map to all six channels", () => {
    expect(getSocialLinks(socialprofils).map(({ label }) => label)).toEqual(
      K11_LABELS,
    );
  });

  it("accepts a map keyed by K-11 ids (x) as well as the legacy twitter key", () => {
    const byId = Object.fromEntries(
      K11_IDS.map((id) => [id, `https://example.test/${id}`]),
    );
    expect(getSocialLinks(byId).map(({ url }) => url)).toEqual(
      K11_IDS.map((id) => `https://example.test/${id}`),
    );

    const both = { x: "https://x.com/a", twitter: "https://twitter.com/a" };
    expect(getSocialLinks(both)).toEqual([
      expect.objectContaining({ id: "x", url: "https://x.com/a" }),
    ]);
  });

  it("ignores Facebook and channels without a URL", () => {
    const links = getSocialLinks({
      facebook: "https://www.facebook.com/someone",
      github: "https://github.com/someone",
      youtube: "",
    });
    expect(links.map(({ id }) => id)).toEqual(["github"]);
    expect(getSocialLinks()).toEqual([]);
  });
});

describe("side strip (Socialicons)", () => {
  it("names each icon link by its channel, in K-11 order", () => {
    render(<Socialicons />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(
      K11_LABELS,
    );
    expect(links.map((link) => link.textContent)).toEqual(
      K11_LABELS.map(() => ""),
    );
    const expected = getSocialLinks(socialprofils);
    links.forEach((link, index) => {
      expect(link).toHaveAccessibleName(K11_LABELS[index]);
      expect(link).toHaveAttribute("href", expected[index].url);
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });
  });
});

describe("menu footer (Headermain)", () => {
  it("shows the same channels as visible link text, without Facebook", () => {
    render(
      <MemoryRouter>
        <Headermain />
      </MemoryRouter>,
    );

    const footer = document.querySelector(".menu_footer");
    const links = within(footer).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(K11_LABELS);
    links.forEach((link) => expect(link).not.toHaveAttribute("aria-label"));
    expect(document.body.innerHTML).not.toMatch(/facebook/i);
  });
});

describe("source (FE-02)", () => {
  it.each([
    "src/header/index.jsx",
    "src/components/socialicons/index.jsx",
    "src/components/socialicons/icons.js",
    "src/components/themetoggle/index.jsx",
    "src/app/routes.jsx",
  ])("%s does not mention Facebook", (file) => {
    expect(readFileSync(resolve(ROOT, file), "utf8")).not.toMatch(/facebook/i);
  });
});
