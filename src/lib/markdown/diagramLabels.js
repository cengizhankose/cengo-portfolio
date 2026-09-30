// DSG-06 step 4: one accessible name per Mermaid diagram, from the markdown.
//
//   accTitle: <text> inside the block   -> that text
//   otherwise                            -> "<prefix>: <nearest heading above>"
//   no heading above                     -> "<prefix>"
//   same name again                      -> "... (2)", "... (3)"
//
// "Heading" means a `#`, `##` or `###` line outside any fenced code block, so
// a `# comment` inside a bash block never becomes a label. Pure text in, plain
// data out: the page (PostMarkdown) and the publish script (stage B, T-05:
// the labels are stored next to the pre-rendered SVGs) use the same rule.
//
// extractDiagramLabels(markdown, { prefix }) -> [{ line, source, label }]
//   line    1-based line of the opening fence (react-markdown reports the same
//           number as node.position.start.line, which is how a rendered block
//           finds its label even when two diagrams share a source)
//   source  the text between the fences
// createDiagramLabels(markdown, { prefix }).get({ line, source }) -> label

// Blockquote markers and one list marker may precede a fence or a heading.
const LEAD = String.raw`^(?:[ \t]*>)*(?:[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)?[ \t]*`;
const OPEN = new RegExp(`${LEAD}(\`{3,}|~{3,})[ \\t]*([^\\s\`]*)[^\`]*$`);
const CLOSE = new RegExp(`${LEAD}(\`{3,}|~{3,})[ \\t]*$`);
const HEADING = new RegExp(
  String.raw`^(?:[ \t]*>)*[ \t]{0,3}#{1,3}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$`,
);
const ACC_TITLE = /^\s*accTitle\s*:\s*(.+?)\s*$/m;

// "## The `Spool`: *dumb* files" -> "The Spool: dumb files"
function plainText(markdown) {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDiagramLabels(markdown, { prefix = "Diagram" } = {}) {
  const lines = String(markdown ?? "").split(/\r\n|\r|\n/);
  const entries = [];
  const used = new Map();
  let heading = "";
  let fence = null; // { mark, size, language, line, body: [] }

  const unique = (label) => {
    const count = (used.get(label) ?? 0) + 1;
    used.set(label, count);
    return count === 1 ? label : `${label} (${count})`;
  };

  for (const [index, text] of lines.entries()) {
    if (fence) {
      const close = CLOSE.exec(text);
      if (
        close &&
        close[1][0] === fence.mark &&
        close[1].length >= fence.size
      ) {
        if (fence.language.toLowerCase() === "mermaid") {
          const source = fence.body.join("\n");
          const title = ACC_TITLE.exec(source)?.[1];
          const base = title
            ? plainText(title)
            : heading
              ? `${prefix}: ${heading}`
              : prefix;
          entries.push({ line: fence.line, source, label: unique(base) });
        }
        fence = null;
      } else {
        fence.body.push(text);
      }
      continue;
    }
    const open = OPEN.exec(text);
    if (open) {
      fence = {
        mark: open[1][0],
        size: open[1].length,
        language: open[2],
        line: index + 1,
        body: [],
      };
      continue;
    }
    const found = HEADING.exec(text);
    if (found) heading = plainText(found[1]);
  }
  return entries;
}

export function createDiagramLabels(markdown, { prefix = "Diagram" } = {}) {
  const entries = extractDiagramLabels(markdown, { prefix });
  const byLine = new Map(entries.map((entry) => [entry.line, entry.label]));
  const bySource = new Map();
  for (const entry of entries) {
    const key = entry.source.trim();
    if (!bySource.has(key)) bySource.set(key, entry.label);
  }
  return {
    entries,
    get({ line, source } = {}) {
      return (
        byLine.get(line) ?? bySource.get(String(source ?? "").trim()) ?? prefix
      );
    },
  };
}
