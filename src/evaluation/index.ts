/**
 * Runs evaluation of PR with DiffKemp changes against base branch.
 *
 * @author Lukas Petr
 */

import { Container } from "../container.js";

/** Class for running evaluations of PRs. */
export class Evaluation {
  /** Runs evaluation and returns promise containing report of the evaluation. */
  async run() {
    using container = new Container();
    const output = await container.run("uname -a");
    return output;
  }
}
