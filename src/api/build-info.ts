// Build metadata for /ready (BE-20). The Docker builder writes build-info.json
// next to server.ts (outside dist/, so it is never served as a static file):
// `buildTime` from `date -u` at build time, `commit` from the GIT_COMMIT build
// argument when the build passes one. Runtime env overrides both, so a
// platform-provided commit variable can be used without a rebuild.
export interface BuildInfo {
  commit: string | null;
  buildTime: string | null;
}

type Env = Record<string, string | undefined>;

export const EMPTY_BUILD_INFO: BuildInfo = { commit: null, buildTime: null };

/** Runtime variables that may carry the deployed commit, first match wins. */
export const COMMIT_ENV_VARS = ["GIT_COMMIT", "SOURCE_COMMIT", "COMMIT_SHA"];

const COMMIT = /^[0-9a-f]{7,40}$/i;

function commitOf(value: unknown): string | null {
  return typeof value === "string" && COMMIT.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function isoTimeOf(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const time = new Date(value.trim());
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

/** Reads `file` (missing or malformed -> nulls) and applies env overrides. */
export async function readBuildInfo(
  file: string,
  env: Env = process.env,
): Promise<BuildInfo> {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = await Bun.file(file).json();
    if (parsed && typeof parsed === "object")
      stored = parsed as Record<string, unknown>;
  } catch {
    // no build-info.json outside the Docker image
  }
  const envCommit = COMMIT_ENV_VARS.map((name) => commitOf(env[name])).find(
    (value) => value !== null,
  );
  return {
    commit: envCommit ?? commitOf(stored.commit),
    buildTime: isoTimeOf(env.BUILD_TIME) ?? isoTimeOf(stored.buildTime),
  };
}
