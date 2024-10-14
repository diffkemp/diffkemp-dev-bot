/**
 * Contains classes for:
 *
 * - Executing DiffKemp on benchmarks from EqBench dataset,
 * - Representing its result,
 * - Representing differences between two results.
 *
 * @author Lukas Petr
 */

import { IContainer } from "../../container.js";
import { DiffKemp } from "../../diffkemp.js";
import {
  ExperimentDifference,
  ExperimentResult,
  ExperimentRunner,
  ExperimentRunnerOptions,
} from "./experiment.js";
import { markdownTable } from "markdown-table";

/** Class for executing DiffKemp on EqBench benchmarks. */
export class EqBenchRunner implements ExperimentRunner {
  /** Path to EqBench dataset. */
  static readonly DATASET_PATH = "/experiments/sources/eqbench";
  /** Path to tool for comparing programs from EqBench dataset using DiffKemp. */
  static readonly SCRIPT_PATH = "/tools/eqbench/run";
  /** Path to directory where snapshots will be saved. */
  static readonly SNAPSHOTS_PATH = "/experiments/snapshots/eqbench";
  /** Path to directory where results will be saved. */
  static readonly RESULTS_PATH = "/experiments/results/eqbench";
  private diffkemp;

  /** Prepares experiment for running. */
  constructor(diffkemp: DiffKemp) {
    this.diffkemp = diffkemp;
  }

  /**
   * Executes DiffKemp on EqBench benchmarks.
   *
   * @returns Promise that resolves with results when the execution ends.
   */
  public async run(options: ExperimentRunnerOptions) {
    await this.diffkemp.container.run(`mkdir -p ${EqBenchRunner.RESULTS_PATH}`);
    const commandOptions: string[] = [];
    // Add user specified compare options
    if (options?.cmpOpts) {
      options.cmpOpts.forEach((opt) => {
        commandOptions.push(`--add-cmp-opt=${opt}`);
      });
    }
    return await this.buildAndCompare(commandOptions);
  }

  /**
   * Builds EqBench programs and compares them using tool for running DiffKemp on the programs.
   *
   * @param options EqBench tool options to be used.
   */
  private async buildAndCompare(options: string[]): Promise<EqBenchResult> {
    const bin = this.diffkemp.getPathToBin();
    const resultDir = EqBenchRunner.RESULTS_PATH;
    const snapDir = EqBenchRunner.SNAPSHOTS_PATH;
    const srcDir = EqBenchRunner.DATASET_PATH;
    const command = [
      EqBenchRunner.SCRIPT_PATH,
      srcDir,
      "--diffkemp",
      bin,
      "-o",
      resultDir,
      "--snap-dir",
      snapDir,
    ];
    command.push(...options);
    await this.diffkemp.runInDevelopmentEnv(command);
    const result = EqBenchResult.fromOutputDir(this.diffkemp.container, resultDir);
    return result;
  }
}

/** Class containing result of DiffKemp execution on EqBench benchmarks. */
export class EqBenchResult implements ExperimentResult {
  /** Runtime of comparison in seconds. */
  comparisonRuntime;
  /**
   * Programs of EqBench dataset placed to categories (TP, FN, TN, FP) based on the result of the
   * evaluation
   */
  perProgram;
  private constructor(
    comparisonRuntime: number,
    perProgram: {
      FN: Set<string>;
      FP: Set<string>;
      TP: Set<string>;
      TN: Set<string>;
    },
  ) {
    this.comparisonRuntime = comparisonRuntime;
    this.perProgram = perProgram;
  }
  /** Extracts results from the output directory of EqBench run. */
  public static async fromOutputDir(container: IContainer, outputDir: string) {
    const jsonContent = await container.readFile(`${outputDir}/result.json`);
    const csvContent = (await container.readFile(`${outputDir}/eqbench-results.csv`)).trim();
    const resultsMetadata = JSON.parse(jsonContent) as EqBenchJSONResults;
    const runtime = resultsMetadata["compare-runtime"];
    const perProgram = {
      FN: new Set<string>(),
      FP: new Set<string>(),
      TP: new Set<string>(),
      TN: new Set<string>(),
    };
    if (csvContent.length !== 0) {
      csvContent.split("\n").forEach((line, index) => {
        if (index === 0) return;
        const [, benchmark, program, version, result] = line.split(";");
        perProgram[result as "TP" | "TN" | "FP" | "FN"].add(
          [benchmark, program, version].join("/"),
        );
      });
    }
    return new EqBenchResult(runtime, perProgram);
  }

  /** Represents results in JSON format, used for caching of results. */
  public toJSON() {
    return {
      comparisonRuntime: this.comparisonRuntime,
      perProgram: {
        TP: Array.from(this.perProgram.TP),
        FP: Array.from(this.perProgram.FP),
        TN: Array.from(this.perProgram.TN),
        FN: Array.from(this.perProgram.FN),
      },
    };
  }

  /**
   * Compares current results with different (base) results.
   *
   * @returns Returns class representing the differences.
   */
  public compare(base: EqBenchResult) {
    return new EqBenchDifference(base, this);
  }
}

/**
 * Class representing difference between results of EqBench benchmarks comparison done using two
 * DiffKemp versions.
 */
export class EqBenchDifference extends ExperimentDifference {
  /* Results. */
  base;
  pr;
  /**
   * Differences in amount of in/correctly evaluated programs between two DiffKemp versions for each
   * category (TN, TP, FN, FP).
   */
  total;
  /** Differences in runtime. */
  comparisonRuntime;
  /**
   * Contains info about which programs are not located for given category in a base result but are
   * located in a pr result.
   */
  perProgram;

  /** Creates difference. */
  constructor(base: EqBenchResult, pr: EqBenchResult) {
    super();
    this.base = base;
    this.pr = pr;
    this.perProgram = {
      TN: this.getNewPrograms(pr.perProgram.TN, base.perProgram.TN),
      TP: this.getNewPrograms(pr.perProgram.TP, base.perProgram.TP),
      FN: this.getNewPrograms(pr.perProgram.FN, base.perProgram.FN),
      FP: this.getNewPrograms(pr.perProgram.FP, base.perProgram.FP),
    };
    this.total = {
      TN: this.pr.perProgram.TN.size - this.base.perProgram.TN.size,
      TP: this.pr.perProgram.TP.size - this.base.perProgram.TP.size,
      FN: this.pr.perProgram.FN.size - this.base.perProgram.FN.size,
      FP: this.pr.perProgram.FP.size - this.base.perProgram.FP.size,
    };
    this.comparisonRuntime = pr.comparisonRuntime - base.comparisonRuntime;
  }
  /** Returns only programs which are not between basePrograms. */
  private getNewPrograms(prPrograms: Set<string>, basePrograms: Set<string>) {
    const newPrograms = new Set(prPrograms);
    basePrograms.forEach((program) => {
      newPrograms.delete(program);
    });
    return newPrograms;
  }
  /** Creates report in markdown format informing about the differences. */
  report() {
    const table = [];
    const header = ["", "TN", "FP", "TP", "FN", "compare runtime"];
    table.push(header);

    table.push(this.reportLine());
    const detailedReport = this.reportDetails();

    return `
# Experiment results

## EqBench

${markdownTable(table)}

<details>

<summary>Details</summary>

${detailedReport}

</details>
    `;
  }

  /** Returns array containing short report of differences [TN, FP, TP, FN, compare runtime]. */
  reportLine() {
    return [
      `${this.base.perProgram.TN.size} ${this.style(this.total.TN, true)}`,
      `${this.base.perProgram.FP.size} ${this.style(this.total.FP, false)}`,
      `${this.base.perProgram.TP.size} ${this.style(this.total.TP, true)}`,
      `${this.base.perProgram.FN.size} ${this.style(this.total.FN, false)}`,
      `${Math.round(this.base.comparisonRuntime)}s ${this.style(Math.round(this.comparisonRuntime), false)}`,
    ];
  }

  /**
   * Reports detail information about differences of results between the two DiffKemp versions in
   * markdown format.
   */
  reportDetails() {
    return `

${this.perProgram.TN.size > 0 ? "### New true negatives" : ""}

${this.getProgramList(this.perProgram.TN)}

${this.perProgram.FP.size > 0 ? "### New false positives" : ""}

${this.getProgramList(this.perProgram.FP)}

${this.perProgram.TP.size > 0 ? "### New true positives" : ""}

${this.getProgramList(this.perProgram.TP)}

${this.perProgram.FN.size > 0 ? "### New false negatives" : ""}

${this.getProgramList(this.perProgram.FN)}

    `;
  }

  /** Returns list of programs in markdown format with links to source files. */
  private getProgramList(programs: Set<string>) {
    return Array.from(programs)
      .map((p) => `- [${p}](${this.getProgramURL(p)})`)
      .join("\n");
  }
  /** Returns program from line from `eqbench-results.csv` file. */
  private getProgramURL(program: string) {
    return `https://github.com/shrBadihi/EqBench/tree/main/benchmarks/${program}`;
  }
}

/** Represents format of JSON file which provides the script for running EqBench. */
interface EqBenchJSONResults {
  results: {
    total: {
      TP: number;
      TN: number;
      FN: number;
      FP: number;
    };
    ["program-level"]: {
      TP: number;
      TN: number;
      FP: number;
      FN: number;
    };
    aggregated: {
      TP: number;
      TN: number;
      FP: number;
      FN: number;
    };
    ["function-level"]: {
      TP: number;
      TN: number;
      FP: number;
      FN: number;
    };
  };
  ["build-command"]: string;
  ["compare-command"]: string;
  ["only-compare"]: boolean;
  ["compare-runtime"]: number;
}
