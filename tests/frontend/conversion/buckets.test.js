// @vitest-environment node
//
// ANL-02 criterion 1: the message length buckets and the error code of a
// failed send, the two values the contact events keep instead of the text.
import { describe, expect, it } from "vitest";
import {
  formErrorCode,
  messageLengthBucket,
} from "../../../src/lib/analytics/buckets.js";
import {
  MESSAGE_LENGTH_BUCKETS,
  sanitizeProps,
} from "../../../src/lib/analytics/events.js";

describe("messageLengthBucket (ANL-02 step 1)", () => {
  it.each([
    [0, "lt_200"],
    [1, "lt_200"],
    [199, "lt_200"],
    [200, "200_1000"],
    [201, "200_1000"],
    [1000, "200_1000"],
    [1001, "gt_1000"],
    [50_000, "gt_1000"],
  ])("%i characters -> %s", (length, bucket) => {
    expect(messageLengthBucket(length)).toBe(bucket);
  });

  it("treats anything that is not a length as the shortest bucket", () => {
    for (const value of [undefined, null, NaN, -5, "abc", Infinity * 0]) {
      expect(messageLengthBucket(value)).toBe("lt_200");
    }
  });

  it("only returns values of the catalogue enum, which sanitizeProps keeps", () => {
    for (const length of [0, 199, 200, 1000, 1001]) {
      const bucket = messageLengthBucket(length);
      expect(MESSAGE_LENGTH_BUCKETS).toContain(bucket);
      expect(
        sanitizeProps("contact_form_submitted", {
          result: "success",
          message_length_bucket: bucket,
        }),
      ).toEqual({ result: "success", message_length_bucket: bucket });
    }
  });
});

describe("formErrorCode (ANL-02 step 3)", () => {
  it("is the status EmailJS reports", () => {
    expect(
      formErrorCode({ status: 412, text: "Gmail_API: Invalid grant" }),
    ).toBe("412");
    expect(formErrorCode({ status: 429 })).toBe("429");
    expect(formErrorCode({ status: 0 })).toBe("0");
    expect(formErrorCode({ status: "400" })).toBe("400");
  });

  it("is 'unknown' when there is no status (chunk or network failure)", () => {
    for (const error of [
      undefined,
      null,
      new TypeError("Failed to fetch"),
      { text: "x" },
      { status: null },
      { status: {} },
    ]) {
      expect(formErrorCode(error)).toBe("unknown");
    }
  });

  it("never carries the error text", () => {
    expect(
      formErrorCode({ status: 400, text: "jane@example.com wrote hi" }),
    ).toBe("400");
  });

  it("gives values the error_code rule of the catalogue accepts", () => {
    for (const error of [{ status: 412 }, { status: 0 }, undefined]) {
      const code = formErrorCode(error);
      expect(
        sanitizeProps("contact_form_submitted", {
          result: "error",
          error_code: code,
        }),
      ).toEqual({ result: "error", error_code: code });
    }
  });
});
