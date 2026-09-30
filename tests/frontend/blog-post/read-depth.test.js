// @vitest-environment node
// ANL-10 step 1 / criterion 1: the pure read-depth helpers.
import { describe, expect, it } from "vitest";
import {
  ENGAGED_SECONDS_BUCKETS,
  READ_DEPTH_PERCENTS,
} from "../../../src/lib/analytics/events.js";
import {
  engagedSecondsBucket,
  reachedThresholds,
  seenPercent,
} from "../../../src/lib/analytics/readDepth.js";

describe("reachedThresholds", () => {
  it("the plan's examples", () => {
    expect(reachedThresholds(800, 0, 3200, new Set())).toEqual([25]);
    expect(reachedThresholds(800, -1600, 3200, new Set([25]))).toEqual([
      50, 75,
    ]);
  });

  it("returns only thresholds that are reached and not fired yet, smallest first", () => {
    expect(reachedThresholds(800, 400, 3200, new Set())).toEqual([]);
    expect(reachedThresholds(800, -2400, 3200, new Set())).toEqual([
      25, 50, 75, 100,
    ]);
    expect(
      reachedThresholds(800, -2400, 3200, new Set([25, 50, 75, 100])),
    ).toEqual([]);
    expect(reachedThresholds(800, -2400, 3200, new Set([50]))).toEqual([
      25, 75, 100,
    ]);
  });

  it("a body shorter than the viewport reaches everything at once (accepted, ANL-10 step 4)", () => {
    expect(reachedThresholds(800, 100, 400, new Set())).toEqual([
      25, 50, 75, 100,
    ]);
  });

  it("a body below the fold or not laid out reaches nothing", () => {
    expect(reachedThresholds(800, 900, 3200, new Set())).toEqual([]);
    expect(reachedThresholds(800, 0, 0, new Set())).toEqual([]);
    expect(reachedThresholds(800, 0, -5, new Set())).toEqual([]);
    expect(reachedThresholds(Number.NaN, 0, 3200, new Set())).toEqual([]);
  });

  it("works without a fired set and only ever returns the validated percents", () => {
    expect(reachedThresholds(800, -2400, 3200)).toEqual([25, 50, 75, 100]);
    for (const value of reachedThresholds(800, -2400, 3200, new Set())) {
      expect(READ_DEPTH_PERCENTS).toContain(value);
    }
  });

  it("a value right at a threshold counts (no float drift)", () => {
    // 0.3 * 3200 = 960, (800 + 160) / 3200 * 100 = 30.000000000000004 territory.
    expect(reachedThresholds(800, -160, 3200, new Set())).toEqual([25]);
    expect(seenPercent(800, -2400, 3200)).toBe(100);
    expect(seenPercent(800, 10_000, 3200)).toBe(0);
  });
});

describe("engagedSecondsBucket", () => {
  it.each([
    [0, "lt_10"],
    [9, "lt_10"],
    [9.99, "lt_10"],
    [10, "10_30"],
    [29, "10_30"],
    [30, "30_60"],
    [40, "30_60"],
    [60, "60_180"],
    [179, "60_180"],
    [180, "180_600"],
    [599, "180_600"],
    [600, "gt_600"],
    [601, "gt_600"],
    [99999, "gt_600"],
  ])("%s s -> %s", (seconds, bucket) => {
    expect(engagedSecondsBucket(seconds)).toBe(bucket);
  });

  it("bad input counts as zero, and every result is a bucket events.js accepts", () => {
    for (const bad of [-1, Number.NaN, undefined, null, "x"]) {
      expect(engagedSecondsBucket(bad)).toBe("lt_10");
    }
    for (const seconds of [0, 10, 30, 60, 180, 600]) {
      expect(ENGAGED_SECONDS_BUCKETS).toContain(engagedSecondsBucket(seconds));
    }
  });
});
