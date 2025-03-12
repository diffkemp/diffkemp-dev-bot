/**
 * Contains class for representing differences of multiple experiments between two versions of
 * DiffKemp.
 *
 * @author Lukas Petr
 */
import { EvaluationResults } from "./evaluation_results.js";
import { ExperimentDifferences, FailedExperimentDifferences } from "./experiments/experiment.js";

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
        // throw new Error(`Missing based result for ${title}`);
        // For now, allowing missing results - e.g. because of timeout.
        return;
      }
      this.differences.push(result.compare(baseResult));
    });
  }
  /** Returns true if there is/are difference/s between the experiments. */
  public hasDifferences(): boolean {
    for (const difference of this.differences) {
      if (difference.hasDifferences()) {
        return true;
      }
    }
    return false;
  }
  /** Returns true if any experiment failed. */
  public hasFailed() {
    for (const difference of this.differences.values()) {
      if (difference instanceof FailedExperimentDifferences) {
        return true;
      }
    }
    return false;
  }
  /** Returns errors of failed experiments. */
  public getFailedErrors(): Error[] {
    const errors = new Array<Error>();
    for (const difference of this.differences.values()) {
      if (difference instanceof FailedExperimentDifferences) {
        const error = difference.getError();
        if (error) {
          errors.push(error);
        }
      }
    }
    return errors;
  }
  /** Returns names of failed experiments. */
  public getFailedTitles(): string[] {
    const titles = new Array<string>();
    for (const difference of this.differences.values()) {
      if (difference instanceof FailedExperimentDifferences) {
        titles.push(difference.getTitle());
      }
    }
    return titles;
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
