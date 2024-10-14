/**
 * Configuration for running PR evaluations.
 *
 * @author Lukas Petr
 */

import { Context } from "probot";
import { getInstallationToken, getPRRepoAndBranch } from "../utils/comments.js";

/** Class containing necessary configuration for running evaluation. */
export class EvaluationConfig {
  /** Owner and repository name from which the PR was made. */
  prRepo;
  /** Branch containing commits which are in the PR. */
  prBranch;

  /** App installation token for base repository, necessary for cloning private repos. */
  token?;

  constructor({ prRepo, prBranch, token }: EvaluationConfigParams) {
    this.prRepo = prRepo;
    this.prBranch = prBranch;
    this.token = token;
  }
  /**
   * Creates config based on the issue comment context.
   *
   * @returns Promise with configuration.
   */
  static async fromIssueComment(context: Context<"issue_comment">) {
    const { repo: prRepo, branch: prBranch } = await getPRRepoAndBranch(context);
    const { private: isPrivate } = context.payload.repository;
    // If the repository is private we need to get token, so we can clone the repo.
    const token = isPrivate ? await getInstallationToken(context) : undefined;
    return new EvaluationConfig({
      prBranch,
      prRepo,
      token,
    });
  }
}
interface EvaluationConfigParams {
  prRepo: string;
  prBranch: string;
  token?: string;
}
