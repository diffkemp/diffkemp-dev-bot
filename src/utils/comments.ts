/**
 * Helper functions for working with PR/issue comments.
 *
 * @author Lukas Petr
 */
import { Context } from "probot";
import { Label, LabelType } from "./labels.js";
import {
  getInstallationToken as basicGetInstallationToken,
  getDefaultBranchSHA as basicGetDefaultBranchSHA,
} from "./basic.js";

/**
 * Checks the commenter's permissions on the repository.
 *
 * @param permissions Array of valid permissions levels ("admin", "write", "read", "none").
 * @returns A promise that resolves to `true` if the user has one of the specified permissions,
 *   otherwise `false`.
 */
export async function checkCommenterPermission(
  context: Context<"issue_comment">,
  permissions: string[],
) {
  const username = context.payload.comment.user.login;
  const response = await context.octokit.rest.repos.getCollaboratorPermissionLevel(
    context.repo({ username }),
  );
  return permissions.includes(response.data.permission);
}
/**
 * Creates an eye emoji reaction on a comment specified by context. Used for marking that the bot is
 * processing the comment.
 *
 * @returns Returns promise which is resolved after the reaction is created containing function for
 *   removing the reaction.
 */
export async function createCommentReaction(
  context: Context<"issue_comment">,
): Promise<() => Promise<void>> {
  const response = await context.octokit.reactions.createForIssueComment(
    context.repo({
      comment_id: context.payload.comment.id,
      content: "eyes",
    }),
  );
  return async () => {
    await context.octokit.reactions.deleteForIssueComment(
      context.repo({
        comment_id: context.payload.comment.id,
        reaction_id: response.data.id,
      }),
    );
  };
}
/**
 * Creates comment on a PR specified by the context.
 *
 * @param body Text of the comment.
 * @returns Returns promise which is resolved after the comment is created.
 */
export async function createComment(context: Context<"issue_comment">, body: string) {
  const responseComment = context.issue({ body });
  await context.octokit.issues.createComment(responseComment);
}

/**
 * Gets info about PR on which the comment was made, expects that the comment was made on PR and not
 * on an issue.
 *
 * @returns Returns promise with pr info.
 */
export async function getPR(context: Context<"issue_comment">) {
  const { data } = await context.octokit.pulls.get(context.pullRequest());
  return {
    state: data.state,
    prRepo: data.head.repo!.full_name,
    prBranch: data.head.ref,
    baseRepo: data.base.repo.full_name,
    baseSHA: data.base.sha,
    prSHA: data.head.sha,
  };
}

/**
 * Returns promise with app installation token for repo based on context. The token only allows to
 * read repository content and will expire after 1 hour.
 */
export async function getInstallationToken(context: Context<"issue_comment">) {
  return await basicGetInstallationToken(context.octokit, {
    installationId: context.payload.installation!.id,
    repositoryId: context.payload.repository.id,
  });
}

/** Returns current SHA of default branch. */
export async function getDefaultBranchSHA(context: Context<"issue_comment">) {
  return await basicGetDefaultBranchSHA(
    context.octokit,
    context.repo({ branch: context.payload.repository.default_branch }),
  );
}

/** Adds commit status to a PR. */
export async function createStatus(context: Context<"issue_comment">, label: Label) {
  const { data } = await context.octokit.pulls.get(context.pullRequest());
  const status = label.getType() === LabelType.FAILURE ? "failure" : "success";
  await context.octokit.repos.createCommitStatus(
    context.repo({
      sha: data.head.sha,
      state: status,
      context: label.getGroupName(),
      description: label.getDescription(),
    }),
  );
}
/** Creates commit statuses based on labels. */
export async function createCommitStatuses(context: Context<"issue_comment">, labels: Label[]) {
  for (const label of labels) {
    await createStatus(context, label);
  }
}
