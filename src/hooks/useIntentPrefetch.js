// Mounts the delegated blog intent preload (PERF-14, src/lib/prefetch.js)
// for as long as the app is on screen, bound to the app's swr cache.
//
// <IntentPrefetch /> renders nothing; src/main.jsx places it inside
// <SWRConfig> so the preloaded answers land in the same cache the pages read.
import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { installIntentPrefetch } from "../lib/prefetch.js";

export function useIntentPrefetch() {
  const { cache, mutate, fallback } = useSWRConfig();
  useEffect(
    () => installIntentPrefetch({ cache, mutate, fallback }),
    [cache, mutate, fallback],
  );
}

export function IntentPrefetch() {
  useIntentPrefetch();
  return null;
}
