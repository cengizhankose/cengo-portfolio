// Pure helpers for the blog read-depth events (ANL-10). No DOM, no React: the
// hook src/pages/blog/useBlogReadTracking.js measures, this file decides.
//
// The thresholds and the bucket names are the ones events.js validates
// (READ_DEPTH_PERCENTS, ENGAGED_SECONDS_BUCKETS): an event with any other
// value would be dropped by track().
import { ENGAGED_SECONDS_BUCKETS, READ_DEPTH_PERCENTS } from "./events.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * How far down the post body the reader has seen, 0-100: the part of the
 * element that is above the bottom edge of the viewport.
 *   viewportH   window.innerHeight
 *   rectTop     the body's getBoundingClientRect().top
 *   rectHeight  the body's getBoundingClientRect().height
 * A body that is not laid out (height 0) has not been seen.
 */
export function seenPercent(viewportH, rectTop, rectHeight) {
  if (!(rectHeight > 0) || !Number.isFinite(viewportH + rectTop)) return 0;
  return clamp(((viewportH - rectTop) / rectHeight) * 100, 0, 100);
}

/**
 * The thresholds (25, 50, 75, 100) that the reader has reached and that are
 * not in `fired` yet, smallest first. A body shorter than the viewport
 * reaches all four on the first measure (accepted behaviour, ANL-10 step 4).
 *   reachedThresholds(800, 0, 3200, new Set())          -> [25]
 *   reachedThresholds(800, -1600, 3200, new Set([25]))  -> [50, 75]
 */
export function reachedThresholds(viewportH, rectTop, rectHeight, fired) {
  const seen = seenPercent(viewportH, rectTop, rectHeight);
  const done = fired ?? new Set();
  // The epsilon absorbs float noise right at a threshold (800 / 3200 * 100).
  return READ_DEPTH_PERCENTS.filter(
    (percent) => seen + 1e-9 >= percent && !done.has(percent),
  );
}

// [upper bound (exclusive), bucket]; the last bucket has no bound.
const BUCKET_BOUNDS = [
  [10, "lt_10"],
  [30, "10_30"],
  [60, "30_60"],
  [180, "60_180"],
  [600, "180_600"],
];

/**
 * engaged_seconds_bucket of a visible-time total in seconds:
 * lt_10 (< 10), 10_30, 30_60, 60_180, 180_600 and gt_600 (600 and more);
 * the lower bound of a bucket belongs to it.
 */
export function engagedSecondsBucket(seconds) {
  const value = Number(seconds);
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  const hit = BUCKET_BOUNDS.find(([bound]) => safe < bound);
  const bucket = hit ? hit[1] : "gt_600";
  // Fails loudly in tests if events.js renames a bucket.
  if (!ENGAGED_SECONDS_BUCKETS.includes(bucket)) {
    throw new Error(`unknown engaged-seconds bucket "${bucket}"`);
  }
  return bucket;
}
