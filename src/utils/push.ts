/** Helper functions for working with push to a repository. */
import { Context } from "probot";

/** Returns true, if the push updates `flake.nix` file. */
export function updatesNix(context: Context<"push">) {
  const { commits, head_commit } = context.payload;
  const all_commits = [...commits];
  if (head_commit) all_commits.push(head_commit);
  for (const commit of all_commits) {
    if (commit.modified.includes("flake.nix")) return true;
  }
  return false;
}
