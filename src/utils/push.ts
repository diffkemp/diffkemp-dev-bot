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

/** Returns true if push updates branch (push can also update tag). */
export function pushToBranch(context: Context<"push">) {
  return context.payload.ref.startsWith("refs/heads");
}

/** Returns true if the push is push to default master branch. */
export function isPushToDefaultBranch(context: Context<"push">) {
  const { default_branch, fork } = context.payload.repository;
  const ref = context.payload.ref;
  // If fork is true it is a pull request.
  return fork === false && `refs/heads/${default_branch}` === ref;
}
