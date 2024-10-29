/**
 * Runs evaluation of PR with DiffKemp changes against base branch.
 *
 * @author Lukas Petr
 */

import { Container } from "../container.js";
import { DiffKemp } from "../diffkemp.js";
import { Cache } from "./cache.js";
import { EvaluationConfig } from "./config.js";
import { EvaluationResults } from "./evaluation_results.js";
import { EqBenchRunner } from "./experiments/eqbench.js";
import {
  ExperimentResults,
  ExperimentRunner,
  ExperimentRunnerOptions,
} from "./experiments/experiment.js";
import { RHELRunner } from "./experiments/rhel.js";

/** Class for running evaluations of PRs. */
export class Evaluation {
  config: EvaluationConfig;
  selectedExperiments: ExperimentSelection;
  constructor(config: EvaluationConfig) {
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
   * Runs evaluation and returns promise containing report of the evaluation.
   *
   * @note This method can be called only when info about PR is provided in the config.
   */
  async run() {
    if (this.config.prRepo === undefined || this.config.prBranch === undefined) {
      throw new Error("Info about PR must be provided in the config!");
    }
    const prRunnerOptions: ExperimentRunnerOptions = {};
    prRunnerOptions.cmpOpts = [];
    if (this.config.options?.prCmpOpt) {
      prRunnerOptions.cmpOpts.push(...this.config.options.prCmpOpt);
    }
    if (this.config.options?.cmpOpt) {
      prRunnerOptions.cmpOpts.push(...this.config.options.cmpOpt);
    }
    const prCachingOption = {
      restore: this.config.options?.rebuild ? undefined : this.config.baseSHA,
    };
    const prEvaluation = new VersionEvaluation(
      this.config.prRepo,
      this.config.prBranch,
      prRunnerOptions,
      this.selectedExperiments,
      this.config.token,
    );
    const prResultsPromise = prEvaluation.runExperiments(prCachingOption);

    const baseResultsPromise = this.restoreOrRunBase();

    const [prResults, baseResults] = await Promise.all([prResultsPromise, baseResultsPromise]);

    const report = prResults.compare(baseResults).report();
    return report;
  }
  /**
   * Tries to restore results for base DiffKemp, if results do not exists launching evaluation of
   * all experiments and caching the results.
   */
  private async restoreOrRunBase() {
    const additionalCompareOptions = this.config.options?.cmpOpt?.length !== 0;
    if (!additionalCompareOptions) {
      // Recover results only if additional compare options are not supplied.
      const results = await EvaluationResults.restoreFromCache(this.config.baseSHA);
      if (results) return results;
    }
    const baseEvaluation = new VersionEvaluation(
      this.config.baseRepo,
      this.config.baseBranch,
      { cmpOpts: this.config.options?.cmpOpt },
      new ExperimentSelection(),
      this.config.token,
    );
    // Note: Try to also restore snapshots from cache - e.g. case when evaluation with user supplied comparison options.
    const results = await baseEvaluation.runExperiments({
      cache: additionalCompareOptions ? undefined : this.config.baseSHA,
      restore: this.config.baseSHA,
    });
    await results.cache(this.config.baseSHA);
    return results;
  }
  /** Runs experiments only on a base branch, caches the results and returns promise with results. */
  async runOnlyBase() {
    const evaluation = new VersionEvaluation(
      this.config.baseRepo,
      this.config.baseBranch,
      {},
      new ExperimentSelection(),
      this.config.token,
    );
    const results = await evaluation.runExperiments({ cache: this.config.baseSHA });
    await results.cache(this.config.baseSHA);
    return results;
  }
}
/** Class for evaluation of certain version of DiffKemp on selected experiments. */
class VersionEvaluation {
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
    repo: string,
    branch: string,
    runnerOptions: ExperimentRunnerOptions,
    experiments: ExperimentSelection,
    token?: string,
  ) {
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
   * @param snapshotsCaching.restore Key for restoring snapshots, if provided restores snapshots and
   *   only compares them.
   * @param snapshotsCaching.cache Key for caching snapshots, if provided caches snapshots after the
   *   experiments are done.
   */
  async runExperiments(snapshotsCaching?: { restore?: string; cache?: string }) {
    using container = new Container();
    const diffkemp = new DiffKemp(container, this.repo, this.branch);
    await diffkemp.setup(this.token);
    if (snapshotsCaching?.restore) {
      await this.restoreSnapshots(diffkemp, snapshotsCaching.restore);
    }
    const runners = this.getRunners(diffkemp);
    const resultsPromises: Promise<ExperimentResults>[] = [];
    runners.forEach((runner) => {
      resultsPromises.push(runner.run(this.experimentOptions));
    });
    const results = await Promise.all(resultsPromises);
    if (snapshotsCaching?.cache) {
      await this.cacheSnapshots(diffkemp, snapshotsCaching.cache);
    }
    return new EvaluationResults(results);
  }
  private async restoreSnapshots(diffkemp: DiffKemp, sha: string) {
    await Cache.restoreSnapshots(await this.getSnapshotCacheKey(diffkemp, sha), diffkemp.container);
  }
  private async cacheSnapshots(diffkemp: DiffKemp, sha: string) {
    await Cache.cacheSnapshots(await this.getSnapshotCacheKey(diffkemp, sha), diffkemp.container);
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
      runners.push(new RHELRunner(diffkemp));
    }
    if (this.experiments.rhelSysctl) {
      runners.push(
        new RHELRunner(diffkemp, {
          sysctl: true,
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
