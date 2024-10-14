/**
 * Helper functions for working with PR/issue comments.
 *
 * @author Lukas Petr
 */
import { Context } from "probot";

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
 * @returns Returns promise which is resolved after the reaction is created.
 */
export async function createCommentReaction(context: Context<"issue_comment">) {
  await context.octokit.reactions.createForIssueComment(
    context.repo({
      comment_id: context.payload.comment.id,
      content: "eyes",
    }),
  );
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
 * Gets name of repository and branch of PR on which the comment was made, expects that the comment
 * was made on PR and not on an issue.
 *
 * @returns Returns promise with repository <owner/repo> and branch name.
 */
export async function getPRRepoAndBranch(context: Context<"issue_comment">) {
  const { data } = await context.octokit.pulls.get(context.pullRequest());
  return {
    repo: data.head.repo!.full_name,
    branch: data.head.ref,
  };
}

/**
 * Returns promise with app installation token for repo based on context. The token only allows to
 * read repository content and will expire after 1 hour.
 */
export async function getInstallationToken(context: Context<"issue_comment">) {
  const response = await context.octokit.rest.apps.createInstallationAccessToken({
    installation_id: context.payload.installation!.id,
    repository_ids: [context.payload.repository.id],
    permissions: {
      contents: "read",
    },
  });
  return response.data.token;
}
