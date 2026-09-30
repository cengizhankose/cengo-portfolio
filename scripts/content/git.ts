// Git state of a content file (SEC-15): the audit trail of every production
// write is the commit history of content/posts/, so a --prod run only
// accepts a file that is tracked and has no uncommitted change, and records
// the commit it came from.
import { basename, dirname } from "node:path";

export interface GitResult {
  code: number;
  stdout: string;
}

/** Runs git with `args` in `cwd`; null when git cannot be started (not installed). */
export type GitRunner = (args: string[], cwd: string) => GitResult | null;

export const runGit: GitRunner = (args, cwd) => {
  try {
    const proc = Bun.spawnSync(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    return { code: proc.exitCode ?? 1, stdout: proc.stdout.toString() };
  } catch {
    return null;
  }
};

const COMMIT_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

export interface FileGitState {
  /** HEAD of the repository that holds the file; null outside a repository. */
  commit: string | null;
  /** Git knows the file (git ls-files --error-unmatch). */
  tracked: boolean;
  /** The file differs from HEAD (staged or not). */
  dirty: boolean;
  /** HEAD is on at least one remote-tracking branch (pushed). */
  pushed: boolean;
}

/** What git says about `file` (an absolute path); every field is conservative when git is missing. */
export function fileGitState(
  file: string,
  git: GitRunner = runGit,
): FileGitState {
  const cwd = dirname(file);
  const name = basename(file);
  const head = git(["rev-parse", "--verify", "HEAD"], cwd);
  const commit =
    head && head.code === 0 && COMMIT_SHA.test(head.stdout.trim())
      ? head.stdout.trim()
      : null;
  if (commit === null) {
    return { commit: null, tracked: false, dirty: true, pushed: false };
  }
  const tracked = git(["ls-files", "--error-unmatch", "--", name], cwd);
  const status = git(["status", "--porcelain", "--", name], cwd);
  const remotes = git(["branch", "-r", "--contains", commit], cwd);
  return {
    commit,
    tracked: tracked?.code === 0,
    dirty: status === null || status.code !== 0 || status.stdout.trim() !== "",
    pushed: remotes?.code === 0 && remotes.stdout.trim() !== "",
  };
}
