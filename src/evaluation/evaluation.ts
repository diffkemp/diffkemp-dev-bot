/**
 * Runs evaluation of PR with DiffKemp changes against base branch.
 *
 * @author Lukas Petr
 */

import { Container } from "../container.js";
import { DiffKemp } from "../diffkemp.js";
import { getInstallationToken } from "../utils/basic.js";
import { EvaluationAbort } from "./abort.js";
import { Cache } from "./cache.js";
import { EvaluationConfig } from "./config.js";
import { EvaluationDifferences } from "./evaluation_differences.js";
import { EvaluationResults } from "./evaluation_results.js";
import { EqBenchRunner } from "./experiments/eqbench.js";
import {
  ExperimentRunner,
  ExperimentRunnerOptions,
  ExperimentResults,
} from "./experiments/experiment.js";
import { RHELRunner } from "./experiments/rhel.js";

/** Time limit for building of kernels. */
const KERNEL_BUILD_TIME_LIMIT = 3.5 * 60 * 60 * 1000;

/** Class for running evaluations of PRs. */
export class Evaluation {
  /**
   * If the base repository is private, the attribute contains app token to be able to clone base
   * repository. (initially undefined)
   */
  cachedRepoAppToken?: string;
  abortController: AbortController;
  config: EvaluationConfig;
  selectedExperiments: ExperimentSelection;
  constructor(config: EvaluationConfig) {
    this.abortController = new AbortController();
    this.config = config;
    this.selectedExperiments = new ExperimentSelection();
    if (config.options?.run) {
      const exp = config.options.run;
      this.selectedExperiments.eqbench = exp.includes("eqbench");
      this.selectedExperiments.rhelFunctions = exp.includes("rhel-functions");
      this.selectedExperiments.rhelSysctl = exp.includes("rhel-sysctl");
    }
  }
  /**
   * Runs evaluation and returns promise with results of the evaluation.
   *
   * @note This method can be called only when info about PR is provided in the config.
   */
  async run() {
    this.config.logger.info("Running evaluation");
    this.abortController.signal.throwIfAborted();
    if (this.config.prRepo === undefined || this.config.prBranch === undefined) {
      throw new Error("Info about PR must be provided in the config!");
    }

    const prResultsPromise = this.runPr();
    const baseResultsPromise = this.restoreOrRunBase();
    const [prResults, baseResults] = await Promise.all([prResultsPromise, baseResultsPromise]);

    const results = prResults.compare(baseResults);
    this.logErrors(results);
    this.abortController.signal.throwIfAborted();
    this.config.logger.info("Running evaluation -- done");
    return results;
  }
  private logErrors(results: EvaluationDifferences) {
    results.getFailedErrors().forEach((error) => {
      this.config.logger.error(error);
    });
  }
  /** Runs experiments on a PR. */
  private async runPr() {
    this.config.logger.debug("Evaluation: Run PR");
    const runnerOptions: ExperimentRunnerOptions = {};
    runnerOptions.cmpOpts = [];
    if (this.config.options?.prCmpOpt) {
      runnerOptions.cmpOpts.push(...this.config.options.prCmpOpt);
    }
    if (this.config.options?.cmpOpt) {
      runnerOptions.cmpOpts.push(...this.config.options.cmpOpt);
    }
    const cachingOption = {
      restore: new Array<string>(),
      cache: this.config.cachePrSnapshots ? this.config.prSHA : undefined,
      forceCaching: this.config.forceCaching,
    };
    // Configuration of snapshots recovering.
    // Recovers snapshots created on PR (if exists), otherwise on base branch.
    // Note: If snapshots were recovered from base branch and PR snapshots caching
    // is enabled, they will be saved also as PR snapshots (which can be unexpected
    // behavior).
    if (!this.config.options?.rebuild) {
      if (this.config.prSHA) cachingOption.restore.push(this.config.prSHA);
      cachingOption.restore.push(this.config.baseSHA);
    }
    const detailedResultsCaching = {
      cache: this.config.detailedResultsCaching ? this.config.prSHA : undefined,
    };
    const evaluation = new VersionEvaluation(
      this.abortController.signal,
      this.config.prRepo!,
      this.config.prBranch!,
      runnerOptions,
      this.selectedExperiments,
      await this.getBaseAppInstallationToken(),
    );
    const results = await evaluation.runExperiments(cachingOption, detailedResultsCaching);
    if (this.config.cachePrResults && this.config.prSHA) {
      await results.cache(this.config.prSHA);
    }
    this.config.logger.debug("Evaluation: Run PR -- done");
    return results;
  }
  /**
   * Tries to restore results for base DiffKemp, if results do not exists launching evaluation of
   * all experiments and caching the results. If some experiment failed, the results are not
   * cached.
   */
  private async restoreOrRunBase() {
    this.config.logger.debug("Evaluation: Restore or run base");
    if (this.config.restoreBaseResults()) {
      const results = await EvaluationResults.restoreFromCache(this.config.baseSHA);
      if (results) {
        this.config.logger.debug("Base results restored from cache");
        return results;
      }
    }
    const baseEvaluation = new VersionEvaluation(
      this.abortController.signal,
      this.config.baseRepo,
      this.config.baseBranch,
      { cmpOpts: this.config.options?.cmpOpt },
      this.selectedExperiments,
      await this.getBaseAppInstallationToken(),
    );
    const detailedResultsCaching = {
      cache: this.config.detailedResultsCaching ? this.config.baseSHA : undefined,
    };
    // Note: Try to also restore snapshots from cache - e.g. case when evaluation with user supplied comparison options.
    const results = await baseEvaluation.runExperiments(
      {
        cache: this.config.cacheBaseSnapshots ? this.config.baseSHA : undefined,
        restore: [this.config.baseSHA],
        forceCaching: this.config.forceCaching,
      },
      detailedResultsCaching,
    );
    if (this.config.cacheBaseResults) {
      if (results.hasFailed()) {
        this.config.logger.error(
          results.getFailedErrors(),
          `Error: results were not cached, following experiments failed: ${results.getFailedTitles().join(", ")}`,
        );
      } else {
        await results.cache(this.config.baseSHA);
      }
    }
    this.config.logger.debug("Evaluation: Restore or run base -- done");
    return results;
  }
  /**
   * Runs experiments only on a base branch, caches the results and returns promise with results.
   * The results are not cached if some experiment failed.
   */
  async runOnlyBase() {
    this.config.logger.info("Running evaluation on only base branch");
    this.abortController.signal.throwIfAborted();
    const evaluation = new VersionEvaluation(
      this.abortController.signal,
      this.config.baseRepo,
      this.config.baseBranch,
      {},
      new ExperimentSelection(),
      await this.getBaseAppInstallationToken(),
    );
    const detailedResultsCaching = {
      cache: this.config.detailedResultsCaching ? this.config.baseSHA : undefined,
    };
    const results = await evaluation.runExperiments(
      {
        cache: this.config.baseSHA,
        forceCaching: this.config.forceCaching,
      },
      detailedResultsCaching,
    );
    if (results.hasFailed()) {
      this.config.logger.error(
        results.getFailedErrors(),
        `Error: results were not cached, following experiments failed: ${results.getFailedTitles().join(", ")}`,
      );
    } else {
      await results.cache(this.config.baseSHA);
    }
    this.abortController.signal.throwIfAborted();
    this.config.logger.info("Running evaluation on only base branch -- done");
    return results;
  }

  public getPRRepoAndBranch() {
    return { repo: this.config.prRepo, branch: this.config.prBranch };
  }

  private async getBaseAppInstallationToken() {
    if (this.cachedRepoAppToken) {
      return this.cachedRepoAppToken;
    } else if (!this.config.baseRepoPrivate || !this.config.installationId) {
      return undefined;
    } else {
      this.cachedRepoAppToken = await getInstallationToken(this.config.octokit, {
        installationId: this.config.installationId,
        repositoryId: this.config.baseRepoId,
      });
      return this.cachedRepoAppToken;
    }
  }

  /** Aborts evaluation. */
  abort(reason: string) {
    this.config.logger.info("Aborting evaluation");
    this.abortController.abort(new EvaluationAbort(reason));
  }
}
/** Class for evaluation of certain version of DiffKemp on selected experiments. */
class VersionEvaluation {
  abortSignal;
  repo;
  branch;
  token;
  experimentOptions;
  experiments;
  /**
   * @param repo Repo containing version of DiffKemp which you want to evaluate.
   * @param branch Branch containing version of DiffKemp which you want to evaluate.
   * @param runnerOptions Options passed down to experiment runners.
   * @param experiments Selection of experiments which you want to run.
   * @param token Token for retrieving private repos.
   */
  constructor(
    abortSignal: AbortSignal,
    repo: string,
    branch: string,
    runnerOptions: ExperimentRunnerOptions,
    experiments: ExperimentSelection,
    token?: string,
  ) {
    this.abortSignal = abortSignal;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.experimentOptions = runnerOptions;
    this.experiments = experiments;
  }
  /**
   * Run experiments and returns promise containing results.
   *
   * @param snapshotsCaching Option for setting caching of snapshots.
   * @param snapshotsCaching.restore Keys for restoring snapshots, if provided restores snapshots
   *   and only compares them. Tries the keys in order, restores the first existing.
   * @param snapshotsCaching.cache Key for caching snapshots, if provided caches snapshots after the
   *   experiments are done.
   * @param snapshotsCaching.forceCaching Saves snapshots even if some experiments failed.
   * @param detailedResultsCaching Allows to cache the directories with results of comparison for
   *   all experiments.
   * @param detailedResultsCaching.cache Key for caching it.
   * @note If some experiment failed when running, the snapshots are not cached.
   */
  async runExperiments(
    snapshotsCaching?: {
      restore?: string[];
      cache?: string;
      forceCaching?: boolean;
    },
    detailedResultsCaching?: {
      cache?: string;
    },
  ) {
    using container = new Container(this.abortSignal);
    const diffkemp = new DiffKemp(container, this.repo, this.branch);
    await diffkemp.setup(this.token);
    if (snapshotsCaching?.restore) {
      for (const sha of snapshotsCaching.restore) {
        if (await this.restoreSnapshots(diffkemp, sha)) {
          break;
        }
      }
    }
    const runners = this.getRunners(diffkemp);
    const resultsPromises: Promise<ExperimentResults>[] = [];
    runners.forEach((runner) => {
      resultsPromises.push(runner.run(this.experimentOptions));
    });
    const results = new EvaluationResults(await Promise.all(resultsPromises));
    if (snapshotsCaching?.cache && (snapshotsCaching.forceCaching || !results.hasFailed())) {
      await this.cacheSnapshots(diffkemp, snapshotsCaching.cache);
    }
    if (detailedResultsCaching?.cache) {
      await this.cacheDetailedResults(diffkemp, detailedResultsCaching.cache);
    }
    this.abortSignal.throwIfAborted();
    return results;
  }
  private async restoreSnapshots(diffkemp: DiffKemp, sha: string) {
    return await Cache.restoreSnapshots(
      await this.getSnapshotCacheKey(diffkemp, sha),
      diffkemp.container,
    );
  }
  private async cacheSnapshots(diffkemp: DiffKemp, sha: string) {
    await Cache.cacheSnapshots(await this.getSnapshotCacheKey(diffkemp, sha), diffkemp.container);
  }
  private async cacheDetailedResults(diffkemp: DiffKemp, sha: string) {
    await Cache.cacheDetailedResults(sha, diffkemp.container);
  }
  /** Returns key for caching and restoring snapshots to/from cache. */
  private async getSnapshotCacheKey(diffkemp: DiffKemp, sha: string) {
    const llvmVersion = await diffkemp.getLlvmVersion();
    const snapshotKey = `${sha}-llvm${llvmVersion}`;
    return snapshotKey;
  }
  /** Returns runners for running experiments based on selected experiments. */
  private getRunners(diffkemp: DiffKemp): ExperimentRunner[] {
    const runners = new Array<ExperimentRunner>();
    if (this.experiments.eqbench) {
      runners.push(new EqBenchRunner(diffkemp));
    }
    if (this.experiments.rhelFunctions) {
      runners.push(new RHELRunner(diffkemp, { build_timeout: KERNEL_BUILD_TIME_LIMIT }));
    }
    if (this.experiments.rhelSysctl) {
      runners.push(
        new RHELRunner(diffkemp, {
          sysctl: true,
          build_timeout: KERNEL_BUILD_TIME_LIMIT,
        }),
      );
    }
    return runners;
  }
}
/** Format for selecting experiments which should be run. */
class ExperimentSelection {
  eqbench = true;
  /** RHEL kernel comparison of KABI functions. */
  rhelFunctions = true;
  /** RHEL kernel comparison of sysctl parameters. */
  rhelSysctl = true;
}
