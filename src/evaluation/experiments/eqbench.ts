/**
 * Contains classes for:
 *
 * - Executing DiffKemp on benchmarks from EqBench dataset,
 * - Representing its result,
 * - Representing differences between two results.
 *
 * @author Lukas Petr
 */

import { join } from "path";
import { IContainer } from "../../container.js";
import { DiffKemp } from "../../diffkemp.js";
import {
  ExperimentDifference,
  SuccessfulExperimentDifferences,
  ExperimentResult,
  SuccessfulExperimentResults,
  ExperimentRunner,
  ExperimentRunnerOptions,
  FailedExperiment,
} from "./experiment.js";
import { ExperimentTitle } from "./titles.js";
import { ExecFileException } from "child_process";

/** Configuration of EqBench runner. */
interface EqBenchConfig {
  /** Program to be compared (mainly for testing). */
  program?: string;
  /** Run comparison using snapshots gained by default optimization. */
  default: boolean;
  /** Run comparison using snapshots gained by O2 optimization. */
  O2: boolean;
}

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
  /** Configuration of the runner. */
  private config: EqBenchConfig;

  /** Prepares experiment for running. */
  constructor(diffkemp: DiffKemp, config: EqBenchConfig = { O2: true, default: true }) {
    this.diffkemp = diffkemp;
    this.config = config;
  }

  /**
   * Executes DiffKemp on EqBench benchmarks.
   *
   * @returns Promise that resolves with results when the execution ends.
   */
  public async run(options: ExperimentRunnerOptions) {
    try {
      return await this.runExperiment(options);
    } catch (e) {
      if (e instanceof Error) {
        return new FailedExperiment(this.getTitle(), e);
      }
      return new FailedExperiment(this.getTitle());
    }
  }

  private async runExperiment(options: ExperimentRunnerOptions) {
    await this.diffkemp.container.run(`mkdir -p ${EqBenchRunner.RESULTS_PATH}`);
    await this.diffkemp.container.run(`mkdir -p ${EqBenchRunner.SNAPSHOTS_PATH}`);
    const commandOptions: string[] = [];
    // Add user specified compare options
    if (options?.cmpOpts) {
      options.cmpOpts.forEach((opt) => {
        commandOptions.push(`--add-cmp-opt=${opt}`);
      });
    }
    // Compare only certain program.
    if (this.config.program) {
      commandOptions.push(`--program=${this.config.program}`);
    }
    const promises = [];
    if (this.config.default) {
      promises.push(this.buildAndCompare("default optimization", commandOptions));
    }
    if (this.config.O2) {
      promises.push(
        this.buildAndCompare("-O2 optimization", [
          ...commandOptions,
          "--no-opt-override",
          "--add-clang-options=-O2",
        ]),
      );
    }
    const results = await Promise.all(promises);
    return new EqBenchResults(this.getTitle(), results);
  }
  public getTitle(): ExperimentTitle {
    return ExperimentTitle.EQBENCH;
  }

  /**
   * Builds EqBench programs and compares them using tool for running DiffKemp on the programs.
   *
   * @param description Describes results based on which options were used.
   * @param options EqBench tool options to be used.
   */
  private async buildAndCompare(description: string, options: string[]): Promise<EqBenchResult> {
    const bin = this.diffkemp.getPathToBin();
    const resultDir = join(EqBenchRunner.RESULTS_PATH, description.replace(" ", "_"));
    const snapDir = join(EqBenchRunner.SNAPSHOTS_PATH, description.replace(" ", "_"));
    let srcDir = EqBenchRunner.DATASET_PATH;
    // If the snapshots exists (e.g. were recovered from cache) use them and only compare them.
    if (await this.diffkemp.container.exists(snapDir)) {
      options.push("--only-compare");
    } else {
      // Copy the sources to be able to build snapshots from EqBench programs in parallel.
      srcDir = await this.diffkemp.container.mkdtemp();
      await this.diffkemp.container.run(["cp", "-r", EqBenchRunner.DATASET_PATH, srcDir]);
      srcDir = join(srcDir, "eqbench");
    }
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
    try {
      await this.diffkemp.runInDevelopmentEnv(command);
    } catch (error) {
      await this.buildAndCompareErrorHandling(command, error as Error);
    }
    const result = EqBenchResult.fromOutputDir(description, this.diffkemp.container, resultDir);
    return result;
  }
  /** Handles error thrown during building and comparing EqBench benchmark. */
  private async buildAndCompareErrorHandling(command: string[], error: Error): Promise<undefined> {
    if (command.includes("--no-opt-override") && error instanceof Error) {
      // If `--no-opt-override` was used in the command, the error can be caused by running the evaluation
      // on and older PR, where `--no-opt-override` command did not yet existed.
      // If this is the case, rerun the command without `--no-opt-override`.
      let e = error;
      // Get the original error.
      while (e.cause && e.cause instanceof Error) e = e.cause;
      if (
        !(e as ExecFileException)?.stderr?.includes("unrecognized arguments: --no-opt-override")
      ) {
        throw error;
      }
      const newCommand = command.filter((arg) => arg != "--no-opt-override");
      await this.diffkemp.runInDevelopmentEnv(newCommand);
    } else {
      throw error;
    }
  }
}

/** Class containing result of DiffKemp execution on EqBench benchmarks. */
export class EqBenchResult extends ExperimentResult {
  /** Runtime of comparison in seconds. */
  comparisonRuntime;
  /**
   * Programs of EqBench dataset placed to categories (TP, FN, TN, FP) based on the result of the
   * evaluation
   */
  perProgram;
  private constructor(
    description: string,
    comparisonRuntime: number,
    perProgram: {
      FN: Set<string>;
      FP: Set<string>;
      TP: Set<string>;
      TN: Set<string>;
    },
  ) {
    super();
    this.description = description;
    this.comparisonRuntime = comparisonRuntime;
    this.perProgram = perProgram;
  }
  /** Extracts results from the output directory of EqBench run. */
  public static async fromOutputDir(
    description: string,
    container: IContainer,
    outputDir: string,
  ): Promise<EqBenchResult> {
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
    return new EqBenchResult(description, runtime, perProgram);
  }

  /** Represents results in JSON format, used for caching of results. */
  public toJSON(): EqBenchCachedResult {
    return {
      description: this.description,
      comparisonRuntime: this.comparisonRuntime,
      perProgram: {
        TP: Array.from(this.perProgram.TP),
        FP: Array.from(this.perProgram.FP),
        TN: Array.from(this.perProgram.TN),
        FN: Array.from(this.perProgram.FN),
      },
    };
  }

  /** Loads EqBench results from JSON format, so they can be loaded from cache. */
  public static fromJSON(json: EqBenchCachedResult) {
    const perProgram = {
      TP: new Set(json.perProgram.TP),
      TN: new Set(json.perProgram.TN),
      FP: new Set(json.perProgram.FP),
      FN: new Set(json.perProgram.FN),
    };
    return new EqBenchResult(json.description, json.comparisonRuntime, perProgram);
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
 * Class containing multiple results, each result gained by using different options and described by
 * different description.
 */
export class EqBenchResults extends SuccessfulExperimentResults {
  /** Loads results from json (cache). */
  public static fromJSON(json: object) {
    const results = Object.values((json as EqBenchCachedResults).results).map((result) =>
      EqBenchResult.fromJSON(result),
    );
    return new EqBenchResults(ExperimentTitle.EQBENCH, results);
  }
  protected createDifferences() {
    const header = ["description", "TN", "FP", "TP", "FN", "compare runtime"];
    return new EqBenchDifferences(this.title, header);
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

  /** Creates difference. The results should have the same description! */
  constructor(base: EqBenchResult, pr: EqBenchResult) {
    super();
    this.description = base.description;
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

  /** Returns true if there is/are difference/s between the experiments. */
  public hasDifferences() {
    return (
      this.perProgram.FN.size > 0 ||
      this.perProgram.FP.size > 0 ||
      this.perProgram.TN.size > 0 ||
      this.perProgram.TP.size > 0
    );
  }

  /**
   * Returns array containing short report of differences [description, TN, FP, TP, FN, compare
   * runtime].
   */
  reportLine() {
    return [
      this.description,
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
  async reportDetails() {
    return Promise.resolve(`
<details>

<summary>Details for ${this.description}</summary>

### Details for ${this.description}

${this.perProgram.TN.size > 0 ? "#### New true negatives" : ""}

${this.getProgramList(this.perProgram.TN)}

${this.perProgram.FP.size > 0 ? "#### New false positives" : ""}

${this.getProgramList(this.perProgram.FP)}

${this.perProgram.TP.size > 0 ? "#### New true positives" : ""}

${this.getProgramList(this.perProgram.TP)}

${this.perProgram.FN.size > 0 ? "#### New false negatives" : ""}

${this.getProgramList(this.perProgram.FN)}

</details>
    `);
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

class EqBenchDifferences extends SuccessfulExperimentDifferences {
  /** Returns labels for found differences. */
  override getLabels() {
    const differences = [...this.differences.values()] as EqBenchDifference[];
    const labelGroup = this.getLabelGroup();
    let label = labelGroup.STABLE;
    if (differences.some((d) => d.total.FN > 0)) {
      label = labelGroup.MORE_FN_OR_FP!;
    } else if (differences.some((d) => d.total.FP > 0)) {
      label = labelGroup.MORE_FN_OR_FP!;
    } else if (differences.some((d) => d.total.TP > 0)) {
      label = labelGroup.MORE_TN_OR_TP!;
    } else if (differences.some((d) => d.total.TN > 0)) {
      label = labelGroup.MORE_TN_OR_TP!;
    }
    return [label];
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

/** Represents format of cached results. */
export interface EqBenchCachedResults {
  title: string;
  results: Record<string, EqBenchCachedResult>;
}
/** Represents format of cached result. */
export interface EqBenchCachedResult {
  description: string;
  comparisonRuntime: number;
  perProgram: {
    FN: string[];
    FP: string[];
    TP: string[];
    TN: string[];
  };
}
