/**
 * Classes for representing results and differences of experiments run directly using DiffKemp's
 * commands.
 */
import { Differences, DifferencesCached, DifferencesComparator } from "../../differences.js";
import { ComparisonStatistics } from "../../diffkemp.js";
import {
  ExperimentDifference,
  ExperimentDifferences,
  ExperimentResult,
  ExperimentResults,
} from "./experiment.js";
import { ExperimentTitle } from "./titles.js";

/** Represents result of compare command. */
export class DefaultResult extends ExperimentResult {
  /** Statistics of comparison. */
  statistics;
  /**
   * Map, where keys are names of compared functions which were evaluated as non-equal and values
   * list of differing functions for the given compared function. The compared functions are
   * inserted to the map in sorted order, also the array with differing functions is sorted.
   */
  differences;
  /**
   * Creates result.
   *
   * @param description Description of result used when showing differences (recommended to use
   *   compared versions).
   * @param statistics Statistics of comparison.
   * @param differences Map of non-equal compared functions with array of differing functions.
   */
  constructor(description: string, statistics: ComparisonStatistics, differences: Differences) {
    super();
    // Using versions as description.
    this.description = description;
    this.statistics = statistics;
    this.differences = differences;
  }
  /** Compares result with base result. */
  public compare(base: DefaultResult) {
    return new DefaultDifference(base, this);
  }
  /** Represents result in JSON format, so it can be cached. */
  public toJSON(): DefaultCachedResult {
    return {
      description: this.description,
      statistics: this.statistics,
      differences: this.differences.toJSON(),
    };
  }
  /** Loads result from json format. */
  public static fromJSON(json: DefaultCachedResult) {
    const { description, statistics, differences } = json;
    return new DefaultResult(description, statistics, Differences.fromJSON(differences));
  }
}

/**
 * Class containing multiple results, each result gained by using different options and described by
 * different description.
 */
export class DefaultResults extends ExperimentResults {
  /** Loads results from json (cache). */
  public static fromJSON(json: object) {
    const cachedResults = json as DefaultCachedResults;
    const results = Object.values(cachedResults.results).map((result) =>
      DefaultResult.fromJSON(result),
    );
    return new DefaultResults(cachedResults.title as ExperimentTitle, results);
  }
  /** Creates instance of `Differences` class. */
  protected createDifferences() {
    const header = [
      "versions",
      "equal",
      "not equal",
      "unknown",
      "errors",
      "total differences",
      "compare runtime",
    ];
    return new DefaultDifferences(this.title, header);
  }
}
/** Class for representing difference between two results. */
export class DefaultDifference extends ExperimentDifference {
  base;
  pr;
  statistics: ComparisonStatistics;
  differencesCmp: DifferencesComparator;
  constructor(base: DefaultResult, pr: DefaultResult) {
    super();
    this.base = base;
    this.pr = pr;
    this.description = this.base.description;
    this.differencesCmp = new DifferencesComparator(base.differences, pr.differences);
    this.statistics = {
      equal: this.pr.statistics.equal - this.base.statistics.equal,
      notEqual: this.pr.statistics.notEqual - this.base.statistics.notEqual,
      unknown: this.pr.statistics.unknown - this.base.statistics.unknown,
      errors: this.pr.statistics.errors - this.base.statistics.errors,
      runtime: pr.statistics.runtime - base.statistics.runtime,
      totalDifferences: pr.statistics.totalDifferences - base.statistics.totalDifferences,
    };
  }
  /**
   * Returns array containing report of differences [equal, notEqual, unknown, errors,
   * totalDifferences, runtime].
   */
  reportLine() {
    return [
      this.description,
      `${this.base.statistics.equal} ${this.style(this.statistics.equal, true)}`,
      `${this.base.statistics.notEqual} ${this.style(this.statistics.notEqual, false)}`,
      `${this.base.statistics.unknown} ${this.style(this.statistics.unknown, false)}`,
      `${this.base.statistics.errors} ${this.style(this.statistics.errors, false)}`,
      `${this.base.statistics.totalDifferences} ${this.style(this.statistics.totalDifferences, false)}`,
      `${Math.round(this.base.statistics.runtime)}s ${this.style(Math.round(this.statistics.runtime), false)}`,
    ];
  }
  /** Returns true if there is/are difference/s between the results. */
  public hasDifferences(): boolean {
    return this.differencesCmp.hasDifferences();
  }
  /** Report details about differences. */
  reportDetails(): string {
    const { onlyInPr: comparedInPr, onlyInBase: comparedInBase } =
      this.differencesCmp.compareNeqFun();

    return `
<details>

<summary>Details for ${this.description}</summary>

### Details for ${this.description}

${comparedInPr.length > 0 ? "#### Compared symbols newly evaluated as non-equal" : ""}

${comparedInPr.map((name) => `- \`${name}\``).join("\n")}

${comparedInBase.length > 0 ? "#### Compared symbols previously evaluated as non-equal" : ""}

${comparedInBase.map((name) => `- \`${name}\``).join("\n")}

${this.differencesCmp.reportDiffering()}

</details>
    `;
  }
}

export class DefaultDifferences extends ExperimentDifferences {
  /** Returns label for found differences. */
  override getLabels() {
    const labelGroup = this.getLabelGroup();
    let label = labelGroup.STABLE;
    const differences = [...this.differences.values()] as DefaultDifference[];
    if (differences.some((d) => d.statistics.errors > 0)) {
      label = labelGroup.MORE_NEQ_UNK_OR_ERR!;
    } else if (differences.some((d) => d.statistics.unknown > 0)) {
      label = labelGroup.MORE_NEQ_UNK_OR_ERR!;
    } else if (differences.some((d) => d.statistics.notEqual > 0)) {
      label = labelGroup.MORE_NEQ_UNK_OR_ERR!;
    } else if (differences.some((d) => d.statistics.totalDifferences > 0)) {
      label = labelGroup.MORE_EQ_OR_DIFF!;
    } else if (differences.some((d) => d.statistics.equal > 0)) {
      label = labelGroup.MORE_EQ_OR_DIFF!;
    }
    return [label];
  }
}

/** Format of multiple results for saving to cache. */
export interface DefaultCachedResults {
  title: string;
  results: Record<string, DefaultCachedResult>;
}
/** Format of result of comparison for saving to cache. */
export interface DefaultCachedResult {
  description: string;
  statistics: ComparisonStatistics;
  differences: DifferencesCached;
}
