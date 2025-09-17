/**
 * Utility functions for working with commits using GitHub REST API.
 *
 * @author Lukas Petr
 */
import { ProbotOctokit } from "probot";

/** Checks if commit (oldSHA) is located before commit (newSHA) in commit history. */
export async function isCommitBeforeCommit(
  octokit: ProbotOctokit,
  owner: string,
  repo: string,
  oldSHA: string,
  newSHA: string,
) {
  const res = await octokit.repos.compareCommitsWithBasehead({
    owner: owner,
    repo: repo,
    basehead: `${oldSHA}...${newSHA}`,
  });
  const { status } = res.data;
  return status === "ahead";
}
