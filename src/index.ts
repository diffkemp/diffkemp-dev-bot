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

/** Text in a comment on a PR which launches evaluation of the PR. */
const EVALUATE_REGEX = /^\\evaluate$/m;

/** Main function run by the Probot framework. */
export default (app: Probot) => {
  app.on("issue_comment.created", async (context) => {
    await issueCommentCreatedHandler(context);
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
    const evaluateComment = EVALUATE_REGEX.exec(message);
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
    const evaluation = new Evaluation();
    const report = await evaluation.run();
    await createComment(context, report);
  } catch (error) {
    await createComment(context, "`Error occurred while running evaluation.`");
    context.log.error(error);
  }
}
