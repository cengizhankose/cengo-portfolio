import { useEffect } from "react";

// Renders ```mermaid code blocks inside rendered markdown HTML.
// Lazy-loads mermaid ESM, renders SVG in place of <pre class="language-mermaid">.
const MermaidRenderer = ({ content }) => {
  useEffect(() => {
    const root = document.getElementById("blog-markdown-root");
    if (!root) return;

    const blocks = Array.from(
      root.querySelectorAll("code.language-mermaid, code.lang-mermaid"),
    );
    if (!blocks.length) return;

    let cancelled = false;

    const run = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          fontFamily: "Raleway, sans-serif",
          themeVariables: {
            primaryColor: "#1f6feb22",
            primaryTextColor: "#c9d1d9",
            primaryBorderColor: "#1f6feb",
            lineColor: "#8b949e",
            secondaryColor: "#161b22",
            tertiaryColor: "#0d1117",
            background: "transparent",
            mainBkg: "#161b22",
            nodeBorder: "#1f6feb",
            clusterBkg: "#0d1117",
            titleColor: "#c9d1d9",
            edgeLabelBackground: "#161b22",
          },
        });

        for (const [i, block] of blocks.entries()) {
          if (cancelled) return;
          const source = block.textContent;
          const pre = block.closest("pre");
          if (!pre) continue;
          try {
            const { svg } = await mermaid.render(
              `mermaid-${Date.now()}-${i}`,
              source,
            );
            if (cancelled) return;
            const wrapper = document.createElement("div");
            wrapper.className = "mermaid-diagram";
            wrapper.innerHTML = svg;
            pre.replaceWith(wrapper);
          } catch {
            // keep the raw <pre> if the diagram fails to parse
          }
        }
      } catch {
        // mermaid failed to load; leave code blocks as-is
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [content]);

  return null;
};

export default MermaidRenderer;
