/**
 * Contains class representing results of multiple experiments done on one version of DiffKemp.
 *
 * @author Lukas Petr
 */
import { Cache } from "./cache.js";
import { EvaluationDifferences } from "./evaluation_differences.js";
import { ExperimentResults } from "./experiments/experiment.js";

export class EvaluationResults {
  results = new Map<string, ExperimentResults>();
  constructor(results: ExperimentResults[]) {
    results.forEach((result) => {
      this.results.set(result.getTitle(), result);
    });
  }
  /** Return result of experiment with specified title or undefined if such result does not exist. */
  public getResultForExperiment(title: string) {
    return this.results.get(title);
  }
  /** Returns all results. */
  public getResults() {
    return this.results;
  }
  /**
   * Returns differences between this results of experiments and results of experiments gained when
   * running on base DiffKemp version.
   */
  public compare(base: EvaluationResults) {
    return new EvaluationDifferences(base, this);
  }
  /** Try to restore results from cache, if results do not exist returns null. */
  public static async restoreFromCache(key: string) {
    const results = await Cache.restoreResults(key);
    if (results) return new EvaluationResults(results);
    return null;
  }
  /** Cache results. */
  public async cache(key: string) {
    for (const [, result] of this.results) {
      await Cache.cacheResults(key, result);
    }
  }
}
