/**
 * GitHub bot for helping to develop DiffKemp.
 *
 * @author Lukas Petr
 */
import { Context, Probot } from "probot";
import {
  checkCommenterPermission,
  createComment,
  createCommentReaction,
} from "./utils/comments.js";
import { Evaluation } from "./evaluation/index.js";
import { CommandParserError, EVALUATION_REGEX, EvaluationConfig } from "./evaluation/config.js";

/** Main function run by the Probot framework. */
export default (app: Probot) => {
  app.on("issue_comment.created", async (context) => {
    await issueCommentCreatedHandler(context);
  });
  app.on("push", async (context) => {
    await pushHandler(context);
  });
};

/** Handles when comment was created on an issue/PR. */
async function issueCommentCreatedHandler(context: Context<"issue_comment.created">) {
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
      await evaluate(context);
    }
  }
}

/** Evaluates impact of a PR on a DiffKemp equivalence checking. */
async function evaluate(context: Context<"issue_comment.created">) {
  await createCommentReaction(context);
  try {
    const evaluation = new Evaluation(await EvaluationConfig.fromIssueComment(context));
    const report = await evaluation.run();
    await createComment(context, report);
  } catch (error) {
    if (error instanceof CommandParserError) {
      await createComment(context, "```\n" + error.message + "\n```");
      return;
    }
    await createComment(context, "`Error occurred while running evaluation.`");
    context.log.error(error);
  }
}
/** Handles pushes to repository. */
async function pushHandler(context: Context<"push">) {
  const defaultBranch = context.payload.repository.default_branch;
  const eventRef = context.payload.ref;
  if (`refs/heads/${defaultBranch}` === eventRef) {
    await pushToMasterHandler(context);
  }
}
/** Handles pushes to master/default branch. */
async function pushToMasterHandler(context: Context<"push">) {
  context.log.info("Push to default branch");
  const evaluation = new Evaluation(await EvaluationConfig.fromPushToMaster(context));
  await evaluation.runOnlyBase();
}
