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
    const prResultsPromise = this.runExperiments(prDiffKemp);
    const baseResultsPromise = this.runExperiments(baseDiffKemp);
    const [prResults, baseResults] = await Promise.all([prResultsPromise, baseResultsPromise]);
    const report = prResults.compare(baseResults).report();
    return report;
  }
  /** Runs experiments using given DiffKemp 'version'. */
  private async runExperiments(diffkemp: DiffKemp) {
    await diffkemp.setup(this.config.token);
    const eqbench = new EqBenchRunner(diffkemp);
    const result = await eqbench.run();
    return result;
  }
}
