// Value reducers for the contact events (ANL-02). The analytics plan never
// sends what a visitor typed: a message becomes a length bucket, a failed
// send becomes a status code. The values are the enums of events.js, so
// sanitizeProps() accepts them.
import { MESSAGE_LENGTH_BUCKETS } from "./events.js";

const [SHORT, MEDIUM, LONG] = MESSAGE_LENGTH_BUCKETS;

/** Upper bounds of the buckets, in characters (ANL-02 step 1). */
export const SHORT_MESSAGE_BELOW = 200;
export const MEDIUM_MESSAGE_UP_TO = 1000;

/**
 * messageLengthBucket(199) -> 'lt_200', (200) and (1000) -> '200_1000',
 * (1001) -> 'gt_1000'. Anything that is not a length (undefined, NaN, a
 * negative number) counts as the shortest bucket.
 */
export function messageLengthBucket(length) {
  const n = Number(length);
  if (!Number.isFinite(n) || n < SHORT_MESSAGE_BELOW) return SHORT;
  return n <= MEDIUM_MESSAGE_UP_TO ? MEDIUM : LONG;
}

/**
 * The error_code of a failed send: the HTTP status EmailJS reports
 * (EmailJSResponseStatus.status: 400, 412, 429 ...), or 'unknown' when the
 * error has none, such as a chunk or network failure. The error text is never
 * used: it can repeat the visitor's input.
 */
export function formErrorCode(error) {
  const status = error?.status;
  return typeof status === "number" || typeof status === "string"
    ? String(status)
    : "unknown";
}
