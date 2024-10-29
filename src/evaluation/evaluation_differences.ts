/**
 * Contains class for representing differences of multiple experiments between two versions of
 * DiffKemp.
 *
 * @author Lukas Petr
 */
import { EvaluationResults } from "./evaluation_results.js";
import { ExperimentDifferences } from "./experiments/experiment.js";

export class EvaluationDifferences {
  differences: ExperimentDifferences[] = [];
  /**
   * Creates differences of results of multiple experiments done on base version of DiffKemp and pr
   * version. The differences are done based on the titles of results.
   */
  constructor(base: EvaluationResults, pr: EvaluationResults) {
    const prResults = pr.getResults();
    prResults.forEach((result, title) => {
      const baseResult = base.getResultForExperiment(title);
      if (baseResult === undefined) {
        throw new Error(`Missing based result for ${title}`);
      }
      this.differences.push(result.compare(baseResult));
    });
  }
  /** Return report with differences of evaluation. */
  report() {
    const reportString: string[] = [];
    reportString.push("# Results of evaluation");
    this.differences.forEach((difference) => {
      reportString.push(difference.report());
    });
    return reportString.join("\n");
  }
}
