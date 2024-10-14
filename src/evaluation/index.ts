/**
 * Runs evaluation of PR with DiffKemp changes against base branch.
 *
 * @author Lukas Petr
 */

import { Container } from "../container.js";
import { DiffKemp } from "../diffkemp.js";
import { EvaluationConfig } from "./config.js";

/** Class for running evaluations of PRs. */
export class Evaluation {
  config: EvaluationConfig;
  constructor(config: EvaluationConfig) {
    this.config = config;
  }
  /** Runs evaluation and returns promise containing report of the evaluation. */
  async run() {
    using container = new Container();
    const diffkemp = new DiffKemp(container, this.config.prRepo, this.config.prBranch);
    await diffkemp.setup(this.config.token);
    const bin = diffkemp.getPathToBin();
    const output = await diffkemp.runInDevelopmentEnv(`${bin} --help`);
    return output;
  }
}
