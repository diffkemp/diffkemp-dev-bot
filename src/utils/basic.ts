/** Shared/basic utils. */

import { ProbotOctokit } from "probot";

/**
 * Returns promise with app installation token for repo. The token only allows to read repository
 * content and will expire after 1 hour.
 */
export async function getInstallationToken(
  octokit: ProbotOctokit,
  params: {
    installationId: number;
    repositoryId: number;
  },
) {
  const response = await octokit.rest.apps.createInstallationAccessToken({
    installation_id: params.installationId,
    repository_ids: [params.repositoryId],
    permissions: {
      contents: "read",
    },
  });
  return response.data.token;
}

/** Returns current SHA of default branch. */
export async function getDefaultBranchSHA(
  octokit: ProbotOctokit,
  params: { owner: string; repo: string; branch: string },
) {
  const response = await octokit.repos.getBranch(params);
  return response.data.commit.sha;
}
