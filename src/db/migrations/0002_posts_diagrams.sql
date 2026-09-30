-- PERF-05 (T-05 stage B): the Mermaid blocks of a post, drawn at publish time,
-- as { "<diagramKey>": { "label", "light", "dark" } } (sanitised SVG strings).
-- Nullable, no default: adding it rewrites no rows, and the release that is
-- still running (it selects named columns and never inserts this one) is not
-- affected while this migration is applied ahead of the new code.
ALTER TABLE "posts" ADD COLUMN "diagrams" jsonb;
