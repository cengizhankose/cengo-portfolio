// PERF-05 / T-05 stage B: the key a pre-rendered Mermaid diagram is stored
// under (posts.diagrams, { [key]: { label, light, dark } }) and looked up by.
//
// Pure and dependency-free on purpose: the publish script (Bun) computes the
// key from the markdown block, <Mermaid> (browser) computes it from the code
// text it is given, and both must get the same string. Hence no hashing API
// that differs between the two (no node:crypto, no SubtleCrypto): FNV-1a over
// the UTF-8 bytes of the normalised source, 32 bit, 8 hex characters.
//
// Normalising means line endings ("\r\n" and "\r" become "\n") and the blank
// space around the block, nothing else: indentation inside a diagram can
// matter to Mermaid, so two sources that differ in it are two diagrams.
// 32 bits are plenty for the handful of diagrams in one post; the publish
// script still refuses two different sources with the same key.

/** The diagram text as it is keyed: LF line endings, no leading or trailing blank space. */
export function normalizeDiagramSource(source) {
  return String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** 8 lower-case hex characters: FNV-1a (32 bit) of the normalised source's UTF-8 bytes. */
export function diagramKey(source) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(normalizeDiagramSource(source))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export default diagramKey;
