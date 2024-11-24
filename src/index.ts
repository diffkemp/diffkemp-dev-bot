/**
 * GitHub bot for helping to develop DiffKemp.
 *
 * @author Lukas Petr
 */
import { Context, Probot } from "probot";
import { checkCommenterPermission } from "./utils/comments.js";
import { EVALUATION_REGEX } from "./evaluation/config.js";
import { EvaluationManager } from "./evaluation/evaluation_manager.js";
import { pushToBranch } from "./utils/push.js";

/** Main function run by the Probot framework. */
export default (app: Probot) => {
  app.on("issue_comment.created", async (context) => {
    await issueCommentCreatedHandler(context);
  });
  app.on("push", async (context) => {
    await pushHandler(context);
  });
  app.on("installation.created", async (context) => {
    await appInstallationHandler(context);
  });
};

/** Handles when comment was created on an issue/PR. */
export async function issueCommentCreatedHandler(context: Context<"issue_comment.created">) {
  context.log.trace("Comment on a PR/issue");
  if (context.payload.sender.type === "Bot") {
    // Ignoring comments from bots.
    context.log.trace("Comment from a bot");
    return;
  }
  const message = context.payload.comment.body;
  if (context.payload.issue?.pull_request) {
    context.log.trace("Comment on PR");
    const evaluateComment = EVALUATION_REGEX.exec(message);
    if (evaluateComment && (await checkCommenterPermission(context, ["admin", "write"]))) {
      // Evaluation comment from user with write permission on a repo.
      context.log.info("Comment triggering evaluation");
      await EvaluationManager.getSingleton().evaluatePr(context);
    }
  }
}

/** Handles pushes to repository. */
async function pushHandler(context: Context<"push">) {
  if (pushToBranch(context)) {
    await EvaluationManager.getSingleton().pushToBranch(context);
  }
}

/** Handles app installation to a repository. */
async function appInstallationHandler(context: Context<"installation.created">) {
  await EvaluationManager.getSingleton().appInstallationHandler(context);
}
