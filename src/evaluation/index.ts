/**
 * Runs evaluation of PR with DiffKemp changes against base branch.
 *
 * @author Lukas Petr
 */

import { Container } from "../container.js";
import { DiffKemp } from "../diffkemp.js";
import { Cache } from "./cache.js";
import { EvaluationConfig } from "./config.js";
import { EqBenchRunner } from "./experiments/eqbench.js";

/** Class for running evaluations of PRs. */
export class Evaluation {
  config: EvaluationConfig;
  constructor(config: EvaluationConfig) {
    this.config = config;
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
    using prContainer = new Container();
    using baseContainer = new Container();
    const prDiffKemp = new DiffKemp(prContainer, this.config.prRepo, this.config.prBranch);
    const baseDiffKemp = new DiffKemp(baseContainer, this.config.baseRepo, this.config.baseBranch);
    const prResultsPromise = this.runExperiments(prDiffKemp, true);
    const baseResultsPromise = this.runExperiments(baseDiffKemp, false);
    const [prResults, baseResults] = await Promise.all([prResultsPromise, baseResultsPromise]);
    const report = prResults.compare(baseResults).report();
    return report;
  }
  /** Runs experiments only on a base branch, returns promise with results. */
  async runOnlyBase() {
    using baseContainer = new Container();
    const baseDiffKemp = new DiffKemp(baseContainer, this.config.baseRepo, this.config.baseBranch);
    const result = await this.runExperiments(baseDiffKemp, false);
    return result;
  }
  /**
   * Runs experiments using given DiffKemp 'version'.
   *
   * @param pr True if the DiffKemp is PR's DiffKemp.
   * @returns Promise containing result of the experiments.
   */
  private async runExperiments(diffkemp: DiffKemp, pr: boolean) {
    await diffkemp.setup(this.config.token);
    if (pr && !this.config.options?.rebuild) {
      // Try to firstly recover snapshot from 'master', so we can skip build phase.
      const llvmVersion = await diffkemp.getLlvmVersion();
      const snapshotKey = `${this.config.baseSHA}-llvm${llvmVersion}`;
      this.config.logger.trace("Trying to restore snapshots to PR container");
      await Cache.restoreSnapshots(snapshotKey, diffkemp.container);
    } else {
      // Try to check if base results are not cached.
      const result = await Cache.restoreResult(this.config.baseSHA);
      if (result) {
        this.config.logger.trace("Restored base results from cache");
        return result;
      }
    }
    const eqbench = new EqBenchRunner(diffkemp);
    let options = {};
    if (pr) {
      options = {
        cmpOpts: this.config.options?.prCmpOpt,
      };
    }
    const result = await eqbench.run(options);
    if (!pr) {
      // Cache base results.
      this.config.logger.trace(result, "Caching base results");
      await Cache.cacheResult(this.config.baseSHA, result);
      this.config.logger.trace(result, "Caching base snapshots");
      const llvmVersion = await diffkemp.getLlvmVersion();
      const snapshotKey = `${this.config.baseSHA}-llvm${llvmVersion}`;
      await Cache.cacheSnapshots(snapshotKey, diffkemp.container);
    }
    return result;
  }
}
