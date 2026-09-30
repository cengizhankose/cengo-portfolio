// The second sentence of the hero subheadline (MKT-16): where he works, or,
// when the owner opens it, what he is available for.
//
// content hero.availability = { status: "open" | "limited" | "closed", text }
//   closed   -> hero.location ("Based in Istanbul, Türkiye.")
//   open or limited -> availability.text
// The sources say nothing about availability, so the default is `closed`
// and nothing is invented. A text that still carries the draft's brackets
// ("[month year]") is never shown, whatever the status says: a half-written
// sentence on the page would do more harm than the location line.
export const AVAILABILITY_STATUSES = Object.freeze([
  "open",
  "limited",
  "closed",
]);

const hasDraftBrackets = (text) => /[[\]]/.test(text);

/** The status line to draw: { status, text }. `status` is what is shown. */
export function heroStatusLine(hero) {
  const availability = hero?.availability;
  const status = AVAILABILITY_STATUSES.includes(availability?.status)
    ? availability.status
    : "closed";
  const text =
    typeof availability?.text === "string" ? availability.text.trim() : "";

  if (status !== "closed" && text !== "" && !hasDraftBrackets(text)) {
    return { status, text };
  }
  return { status: "closed", text: hero?.location ?? "" };
}
