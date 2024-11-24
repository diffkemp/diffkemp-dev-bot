/**
 * Manages running of evaluations.
 *
 * @author Lukas Petr
 */
import { Evaluation } from "./evaluation.js";
import { Context } from "probot";
import { CommandParserError, EvaluationConfig } from "./config.js";
import { isPushToDefaultBranch, updatesNix } from "../utils/push.js";
import { Container } from "../container.js";
import { createComment, createCommentReaction, createCommitStatuses } from "../utils/comments.js";
import { createLabelsOnIssue, removeLabelsOnIssue } from "../utils/labels.js";

/** Class which manages running of evaluation based on events on GitHub repo. */
export class EvaluationManager {
  private static instance = new EvaluationManager();
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}
  static getSingleton() {
    return EvaluationManager.instance;
  }

  /**
   * Informs about push to branch, if evaluation for the branch exists then it aborts it.
   *
   * @param context
   */
  public async pushToBranch(context: Context<"push">) {
    if (isPushToDefaultBranch(context)) {
      await this.pushToMasterHandler(context);
    }
  }

  /** Handles pushes to master/default branch. */
  async pushToMasterHandler(context: Context<"push">) {
    context.log.info("Push to default branch");
    if (updatesNix(context)) {
      context.log.info("Rebuilding container image");
      await Container.rebuildImage();
    }
    const evaluation = new Evaluation(await EvaluationConfig.fromPushToMaster(context));
    await evaluation.runOnlyBase();
  }

  /** Evaluates impact of a PR on a DiffKemp equivalence checking. */
  async evaluatePr(context: Context<"issue_comment.created">) {
    await createCommentReaction(context);
    try {
      const evaluation = new Evaluation(await EvaluationConfig.fromIssueComment(context));
      const results = await evaluation.run();
      for (const result of results.differences) {
        const labelGroup = result.getLabelGroup();
        if (labelGroup) {
          await removeLabelsOnIssue(context, labelGroup);
        }
        await createComment(context, result.report());
        const labels = result.getLabels();
        await createLabelsOnIssue(context, labels);
        await createCommitStatuses(context, labels);
      }
    } catch (error) {
      if (error instanceof CommandParserError) {
        await createComment(context, "```\n" + error.message + "\n```");
        return;
      }
      await createComment(context, "`Error occurred while running evaluation.`");
      context.log.error(error);
    }
  }
}
