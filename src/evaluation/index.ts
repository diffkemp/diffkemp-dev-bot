/**
 * Runs evaluation of PR with DiffKemp changes against base branch.
 *
 * @author Lukas Petr
 */

import { Container } from "../container.js";
import { DiffKemp } from "../diffkemp.js";
import { EvaluationConfig } from "./config.js";
import { EqBenchRunner } from "./experiments/eqbench.js";

/** Class for running evaluations of PRs. */
export class Evaluation {
  config: EvaluationConfig;
  constructor(config: EvaluationConfig) {
    this.config = config;
  }
  /** Runs evaluation and returns promise containing report of the evaluation. */
  async run() {
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
  /**
   * Runs experiments using given DiffKemp 'version'.
   *
   * @param pr True if the DiffKemp is PR's DiffKemp.
   */
  private async runExperiments(diffkemp: DiffKemp, pr: boolean) {
    await diffkemp.setup(this.config.token);
    const eqbench = new EqBenchRunner(diffkemp);
    let options = {};
    if (pr) {
      options = {
        cmpOpts: this.config.options.prCmpOpt,
      };
    }
    const result = await eqbench.run(options);
    return result;
  }
}
