/**
 * Manages running of evaluations.
 *
 * @author Lukas Petr
 */
import { Evaluation } from "./evaluation.js";
import { Context } from "probot";
import { CommandParserError, EvaluationConfig } from "./config.js";
import { getTimeOfPush, isPushToDefaultBranch, updatesNix } from "../utils/push.js";
import { Container } from "../container.js";
import { createComment, createCommentReaction, createCommitStatuses } from "../utils/comments.js";
import { createLabelsOnIssue, removeLabelsOnIssue } from "../utils/labels.js";
import { Mutex } from "async-mutex";
import { EvaluationAbort } from "./abort.js";

/** Info about requested evaluation so it can be aborted. */
interface EvaluationInfo {
  /** True if evaluation is run only on master (because of push). */
  master: boolean;
  /** If evaluation is run on a PR contains name of repo and branch which is evaluated. */
  prRepo?: string;
  prBranch?: string;
  /** Function for aborting the evaluation. */
  abort: (reason: string) => void;
  /** Timestamp when the evaluation was requested. */
  timestamp: Date;
}
/** Class which manages running of evaluation based on events on GitHub repo. */
export class EvaluationManager {
  /** Mutex controlling that only one evaluation will be run in a time. */
  private runningEvaluationMutex = new Mutex();
  /** Info about evaluation which are either running or prepared to be run. */
  private evaluationsInfo = new Array<EvaluationInfo>();
  /** Mutex controlling access to evaluationsInfo attribute. */
  private evaluationsInfoMutex = new Mutex();
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
    context.log.debug("Push to branch");
    if (isPushToDefaultBranch(context)) {
      await this.pushToMasterHandler(context);
    }
    // Push to PR branch is solved by listening to `pull_request.synchronize`.
  }

  /** Process pull request synchronization (push to branch), aborts running evaluations. */
  public async pullRequestSync(context: Context<"pull_request.synchronize">) {
    const prNumber = context.payload.pull_request.number;
    context.log.info(`PR sync (${prNumber})`);
    // Owner and branch from which the PR was created.
    const repo = context.payload.pull_request.head.repo?.full_name;
    if (!repo) {
      context.log.error(`Error: missing repository name (PR ${prNumber})`);
      return;
    }
    const branch = context.payload.pull_request.head.ref;
    await this.abortPREvaluations(repo, branch);
  }

  /** Handles pushes to master/default branch. */
  async pushToMasterHandler(context: Context<"push">) {
    context.log.info("Push to default branch");
    const timestamp = getTimeOfPush(context);
    try {
      context.log.info("Push to default branch");
      const evaluation = new Evaluation(await EvaluationConfig.fromPushToMaster(context));
      await this.runMasterEvaluation(timestamp, evaluation, async () => {
        await this.rebuildContainerIfNeeded(context);
      });
    } catch (e) {
      if (e instanceof EvaluationAbort) context.log.info(e);
      else context.log.error(e);
    }
  }

  /**
   * Launches evaluation on master branch.
   *
   * @param evaluation Evaluation instance to be run.
   * @param beforeEval Function, which is called before the evaluation is initiated.
   */
  private async runMasterEvaluation(
    timestamp: Date,
    evaluation: Evaluation,
    beforeEval?: () => Promise<void>,
  ) {
    await this.runExclusively({ evaluation, timestamp, master: true }, async () => {
      await beforeEval?.();
      await evaluation.runOnlyBase();
    });
  }

  /** Rebuilds container if push updates nix. */
  private async rebuildContainerIfNeeded(context: Context<"push">) {
    if (updatesNix(context)) {
      context.log.info("Rebuilding container image");
      await Container.rebuildImage();
      context.log.info("Rebuilding container image -- done");
    }
  }

  /** Evaluates impact of a PR on a DiffKemp equivalence checking. */
  async evaluatePr(context: Context<"issue_comment.created">) {
    // Creating reaction on the comment.
    const removeCommentReaction = await createCommentReaction(context);
    try {
      const evaluation = new Evaluation(await EvaluationConfig.fromIssueComment(context));
      await this.runExclusively(
        {
          evaluation: evaluation,
          timestamp: new Date(context.payload.comment.created_at),
          master: false,
        },
        async () => {
          // Running evaluation
          const results = await evaluation.run();
          // Creating comment, labels and commit statuses
          for (const result of results.differences) {
            const labelGroup = result.getLabelGroup();
            if (labelGroup) {
              await removeLabelsOnIssue(context, labelGroup);
            }
            await createComment(context, await result.report());
            const labels = result.getLabels();
            await createLabelsOnIssue(context, labels);
            await createCommitStatuses(context, labels);
          }
        },
      ); // End of runExclusively
    } catch (error) {
      if (error instanceof CommandParserError) {
        await createComment(context, "```\n" + error.message + "\n```");
        return;
      }
      if (error instanceof EvaluationAbort) {
        context.log.info(error);
        return;
      }
      await createComment(context, "`Error occurred while running evaluation.`");
      context.log.error(error);
    } finally {
      await removeCommentReaction();
    }
  }

  /** On adding app to repository, runs first evaluation so the results and snapshots are cached. */
  public async appInstallationHandler(context: Context<"installation.created">) {
    try {
      const evaluation = new Evaluation(await EvaluationConfig.fromCreatedInstallation(context));
      const timestamp = new Date(context.payload.installation.created_at);
      context.log.info("Running first evaluation on master branch");
      await this.runMasterEvaluation(timestamp, evaluation);
    } catch (e) {
      context.log.error(e);
    }
  }

  /**
   * Runs evaluation exclusively.
   *
   * @param info Info about evaluation.
   * @param info.evaluation Instance of evaluation which is used by evaluationFunction.
   * @param info.timestamp Date and time when the evaluation was issued.
   * @param info.master True if evaluation is run only on master branch and not PR.
   * @param evaluationFunction Function which runs evaluation and things connected with it, the
   *   function is run exclusively by using `runningEvaluationMutex` variable. The function can be
   *   aborted if:
   *
   *   - It is a PR evaluation and
   *
   *       - Push to branch occurs or
   *       - New evaluation is issued on the PR
   *   - It is a master evaluation and
   *
   *       - Push to master occurs.
   */
  private async runExclusively<T>(
    info: { evaluation: Evaluation; timestamp: Date; master: boolean },
    evaluationFunction: (signal: AbortSignal) => Promise<T>,
  ): Promise<void> {
    // Prepares evaluation info and AbortController for aborting the evaluationFunction.
    const abortController = new AbortController();
    const { repo, branch } = info.evaluation.getPRRepoAndBranch();
    const evalInfo: EvaluationInfo = {
      prRepo: repo,
      prBranch: branch,
      timestamp: info.timestamp,
      master: info.master,
      abort: (reason: string) => {
        abortController.abort(new EvaluationAbort(reason));
        info.evaluation.abort(reason);
      },
    };

    const run = await this.shouldRunEvaluationFunction(evalInfo);
    if (!run) return;
    // Run evaluation
    await this.runningEvaluationMutex.runExclusive(async () => {
      try {
        abortController.signal.throwIfAborted();
        await evaluationFunction(abortController.signal);
      } finally {
        // Removing info about current evaluation from the array.
        await this.evaluationsInfoMutex.runExclusive(() =>
          this.evaluationsInfo.splice(this.evaluationsInfo.indexOf(evalInfo), 1),
        );
      }
    });
  } /* runExclusively method*/

  /**
   * Goes over evaluations which are running / prepared to be run, aborts some of the evaluations if
   * necessary and returns if current evaluation should be run (true) or not (false). If it should
   * be run adds the evaluation info to evaluationsInfo array.
   *
   * @param currentEvalInfo Info about current evaluation.
   */
  private async shouldRunEvaluationFunction(currentEvalInfo: EvaluationInfo): Promise<boolean> {
    return await this.evaluationsInfoMutex.runExclusive(() => {
      for (const info of this.evaluationsInfo) {
        if (info.master && currentEvalInfo.master) {
          // For master run only the latest evaluation.
          if (info.timestamp < currentEvalInfo.timestamp)
            info.abort("New push to master occurred.");
          else return false;
        }
        if (
          !info.master &&
          !currentEvalInfo.master &&
          currentEvalInfo.prRepo === info.prRepo &&
          currentEvalInfo.prBranch === info.prBranch
        ) {
          // For the same PR run only the latest evaluation.
          if (info.timestamp < currentEvalInfo.timestamp)
            info.abort("New evaluation on the PR issued.");
          else return false;
        }
      }
      this.evaluationsInfo.push(currentEvalInfo);
      return true;
    });
  }

  /** Aborts all evaluations which are running on a PR identified by repo and branch. */
  private async abortPREvaluations(repo: string, branch: string) {
    await this.evaluationsInfoMutex.runExclusive(() => {
      this.evaluationsInfo.forEach((info) => {
        if (info.master === false && info.prRepo === repo && info.prBranch === branch) {
          info.abort("Push to branch occurred.");
        }
      });
    });
  }
}
