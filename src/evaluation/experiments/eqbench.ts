/**
 * Contains classes for:
 *
 * - Executing DiffKemp on benchmarks from EqBench dataset,
 * - Representing its result
 *
 * @author Lukas Petr
 */

import { IContainer } from "../../container.js";
import { DiffKemp } from "../../diffkemp.js";
import { ExperimentResult, ExperimentRunner } from "./experiment.js";

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
  public async run() {
    await this.diffkemp.container.run(`mkdir -p ${EqBenchRunner.RESULTS_PATH}`);
    return await this.buildAndCompare();
  }

  /** Builds EqBench programs and compares them using tool for running DiffKemp on the programs. */
  private async buildAndCompare(): Promise<EqBenchResult> {
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
