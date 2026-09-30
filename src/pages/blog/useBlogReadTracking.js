// Read depth and engaged time of one blog post (ANL-10).
//
//   blog_read_progress { post_slug, percent }       once each at 25 / 50 / 75 / 100
//   blog_post_engaged { post_slug, engaged_seconds_bucket }   once, on leaving
//
// `rootRef` is the post body (the element whose height is the article text),
// `enabled` is false until the post has rendered. A new slug starts from zero:
// the effect is keyed on the slug, so going from one post to another (in the
// SPA) closes the first view and opens the second.
//
// One scroll listener (passive), at most one measure per animation frame; a
// ResizeObserver re-measures when the body changes height after the first
// paint (diagrams drawn late, images loading). Engaged time counts only while
// the tab is visible; it is sent at most once per view, when the tab is
// hidden, the page is hidden (pagehide) or the post unmounts, and only when it
// reached one second.
import { useEffect } from "react";
import { track } from "../../lib/analytics/index.js";
import {
  engagedSecondsBucket,
  reachedThresholds,
} from "../../lib/analytics/readDepth.js";

const MIN_ENGAGED_MS = 1000;

export function useBlogReadTracking(slug, rootRef, enabled) {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !slug || !root) return undefined;

    const fired = new Set();
    let frame = 0;
    let engagedMs = 0;
    let visibleSince =
      document.visibilityState === "visible" ? Date.now() : null;
    let engagedSent = false;

    const measure = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      for (const percent of reachedThresholds(
        window.innerHeight,
        rect.top,
        rect.height,
        fired,
      )) {
        fired.add(percent);
        track("blog_read_progress", { post_slug: slug, percent });
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    const stopClock = () => {
      if (visibleSince !== null) {
        engagedMs += Date.now() - visibleSince;
        visibleSince = null;
      }
    };
    const sendEngaged = () => {
      stopClock();
      if (engagedSent || engagedMs < MIN_ENGAGED_MS) return;
      engagedSent = true;
      track("blog_post_engaged", {
        post_slug: slug,
        engaged_seconds_bucket: engagedSecondsBucket(engagedMs / 1000),
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendEngaged();
      else if (visibleSince === null && !engagedSent) visibleSince = Date.now();
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendEngaged);
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(schedule)
        : null;
    observer?.observe(root);
    schedule();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendEngaged);
      observer?.disconnect();
      sendEngaged();
    };
  }, [slug, rootRef, enabled]);
}
