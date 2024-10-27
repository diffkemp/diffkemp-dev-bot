/**
 * File contains abstract class representing experiments and things connected with it.
 *
 * @author Lukas Petr
 */

import { markdownTable } from "markdown-table";

export interface ExperimentRunner {
  run(options?: ExperimentRunnerOptions): Promise<ExperimentResult>;
}
export interface ExperimentRunnerOptions {
  cmpOpts?: string[];
}

/** Represents a result of an experiment. */
export abstract class ExperimentResult {
  /** Description of the result. */
  description!: string;
  /**
   * Compares two results between each other. The results should have same description (e.g. gained
   * by same options).
   */
  abstract compare(base: ExperimentResult): ExperimentDifference;
  /** Represents results in JSON format, so they can be cached. */
  abstract toJSON(): object;
}

/**
 * Represents multiple results of an experiment (e.g. results by using different options or for
 * different versions).
 */
export abstract class ExperimentResults {
  /** Maps description of the result to the result. */
  private results = new Map<string, ExperimentResult>();
  /** Title/name of the results. */
  protected title;
  constructor(title: string, results: ExperimentResult[]) {
    this.title = title;
    results.forEach((result) => {
      this.results.set(result.description, result);
    });
  }
  /** Creates instance of ExperimentDifferences. */
  protected abstract createDifferences(): ExperimentDifferences;
  /**
   * Compares results with base results, the comparison is done based on the description of the
   * results.
   */
  public compare(base: ExperimentResults): ExperimentDifferences {
    const differences = this.createDifferences();
    this.results.forEach((prResult, description) => {
      const baseResult = base.getByDescription(description);
      if (baseResult === undefined) {
        throw new Error(`Missing base result for '${description}'`);
      }
      differences.add(prResult.compare(baseResult));
    });
    return differences;
  }
  /** Represents results as json so they can be cached. */
  public toJSON(): { title: string; results: Record<string, ExperimentResult> } {
    return {
      title: this.title,
      results: Object.fromEntries(this.results.entries()),
    };
  }
  /** Returns result with specified description. */
  public getByDescription(description: string): ExperimentResult | undefined {
    return this.results.get(description);
  }
}

/**
 * Abstract class representing difference between results of a experiment run on two version of
 * DiffKemp.
 */
export abstract class ExperimentDifference {
  description!: string;
  /**
   * Styles value representing differences between programs using color.
   *
   * @param val Value to format.
   * @param correct True if the value is connected with number of correctly evaluated programs.
   * @returns Returns styled value.
   * @note
   *   Having less (val<0) false positives (!correct) is good thing -> green color.
   */
  protected style(val: number, correct: boolean) {
    if (val < 0 && correct) return `$$\\color{red}${val}$$`;
    else if (val > 0 && correct) return `$$\\color{green}+${val}$$`;
    else if (val > 0 && !correct) return `$$\\color{red}+${val}$$`;
    else if (val < 0 && !correct) return `$$\\color{green}${val}$$`;
    return "";
  }
  /** Returns array containing short report of differences. */
  abstract reportLine(): string[];
  /**
   * Reports detail information about differences of results between the two DiffKemp versions in
   * markdown format.
   */
  abstract reportDetails(): string;
}

/**
 * Class representing multiple differences between results of experiment done using two DiffKemp
 * versions and different versions/configurations of experiment.
 */
export class ExperimentDifferences {
  /** Maps description of difference to difference, */
  private differences = new Map<string, ExperimentDifference>();
  private title;
  /**
   * Header of table for reporting found differences, used in connection with
   * `ExperimentDifference`'s `reportLine` method.
   */
  private header;
  public constructor(title: string, header: string[]) {
    this.title = title;
    this.header = header;
  }
  /* Adds new difference */
  public add(difference: ExperimentDifference) {
    this.differences.set(difference.description, difference);
  }
  /**
   * Returns string with report about differences of evaluation done by using multiple
   * configuration/versions between base branch and pr branch.
   */
  public report() {
    const table = [];
    table.push(this.header);

    const detailedReports: string[] = [];

    this.differences.forEach((difference) => {
      table.push(difference.reportLine());
      detailedReports.push(difference.reportDetails());
    });

    return `
## ${this.title}

${markdownTable(table)}

<details>

<summary>Details</summary>

${detailedReports.join("\n")}

</details>
    `;
  }
}
