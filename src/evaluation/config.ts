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
  /** Owner and repository on which the PR was opened. */
  baseRepo;
  /** Default branch of base repository. */
  baseBranch;

  constructor({ prRepo, prBranch, baseRepo, baseBranch, token }: EvaluationConfigParams) {
    this.prRepo = prRepo;
    this.prBranch = prBranch;
    this.baseRepo = baseRepo;
    this.baseBranch = baseBranch;
    this.token = token;
  }
  /**
   * Creates config based on the issue comment context.
   *
   * @returns Promise with configuration.
   */
  static async fromIssueComment(context: Context<"issue_comment">) {
    const { repo: prRepo, branch: prBranch } = await getPRRepoAndBranch(context);
    const {
      private: isPrivate,
      full_name: baseRepo,
      default_branch: baseBranch,
    } = context.payload.repository;
    // If the repository is private we need to get token, so we can clone the repo.
    const token = isPrivate ? await getInstallationToken(context) : undefined;
    return new EvaluationConfig({
      prBranch,
      prRepo,
      baseBranch,
      baseRepo,
      token,
    });
  }
}
interface EvaluationConfigParams {
  prRepo: string;
  prBranch: string;
  baseRepo: string;
  baseBranch: string;
  token?: string;
}
