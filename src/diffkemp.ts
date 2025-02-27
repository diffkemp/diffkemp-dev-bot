/**
 * Contains class for working with DiffKemp.
 *
 * @author Lukas Petr
 */

import { join } from "path";
import { IContainer } from "./container.js";
import { Differences } from "./differences.js";
import { EvaluationAbort } from "./evaluation/abort.js";

/** Class for working with DiffKemp inside a container. */
export class DiffKemp {
  /** Owner name and repository name. */
  private repo: string;
  /** Branch name. */
  private branch: string;
  /** Path to directory with cloned DiffKemp. */
  private directory = "/diffkemp";
  /** Path to directory containing DiffKemp executable. */
  private pathToBinDir = "/diffkemp-bin";
  /** Container in which is DiffKemp setup. */
  readonly container;
  /**
   * @param container Container where will be DiffKemp setup.
   * @param repo <owner-name/repository-name>
   * @param ref Branch name.
   * @note It is necessary to be careful with the repo and ref values,
   *   because these are created by user and could be potential way of injection attack.
   */
  constructor(container: IContainer, repo: string, ref: string) {
    this.repo = repo;
    this.branch = ref;
    this.container = container;
  }
  /**
   * Setups DiffKemp in the container.
   *
   * @param token App installation token (necessary for private repos).
   */
  async setup(token?: string) {
    await this._clone(token);
    await this._build();
  }
  /** Clones DiffKemp repository with specified branch. */
  private async _clone(token?: string) {
    let command = [
      "git",
      "clone",
      "--depth",
      "1",
      "-b",
      this.branch,
      this._getGitUrl(token),
      this.directory,
    ];
    try {
      await this.container.run(command.join(" "));
    } catch (e) {
      // If the branch is not branch but SHA the previous command will not work,
      // it is necessary to pull the whole repo and checkout to the SHA.
      if (e instanceof EvaluationAbort) {
        throw e;
      }
      command = ["git", "clone", this._getGitUrl(token), this.directory];
      await this.container.run(command.join(" "));
      await this.container.run(`git -C ${this.directory} fetch origin ${this.branch}`);
      await this.container.run(`git -C ${this.directory} checkout ${this.branch}`);
    }
  }
  /** Returns url for cloning repo, for private repo, token is necessary. */
  private _getGitUrl(token?: string) {
    if (token) {
      // Private repo, use token for cloning.
      return `https://x-access-token:${token}@github.com/${this.repo}`;
    } else {
      return `https://github.com/${this.repo}`;
    }
  }

  /** Builds DiffKemp. */
  private async _build() {
    await this.container.run(`nix build ${this.directory} -o ${this.pathToBinDir}`);
  }
  /** Returns path to DiffKemp executable. */
  getPathToBin() {
    return join(this.pathToBinDir, "bin/diffkemp");
  }
  /**
   * Runs command in DiffKemp development environment.
   *
   * @returns Promise that resolves when the command finishes. The promise contains stdout output of
   *   the command.
   */
  async runInDevelopmentEnv(command: string | string[]) {
    if (command instanceof Array) {
      command = command.join(" ");
    }
    return this.container.run(`nix develop ${this.directory} --command bash -c '${command}'`);
  }
  /** Returns latest LLVM version which DiffKemp supports. */
  async getLlvmVersion() {
    const output = await this.runInDevelopmentEnv("llvm-as --version");
    return /LLVM version (\d+)/.exec(output)![1];
  }
  /**
   * Builds kernel.
   *
   * @param srcDir Path to kernel source directory.
   * @param outDir Path to directory where the snapshot will be saved.
   * @param symbolFile Path to file containing list o symbols which will be prepared for comparison.
   * @param sysctl True if the symbols specified in the symbol list are sysctl parameters.
   * @returns Promise that contains stdout of the build command.
   */
  async buildKernel(srcDir: string, outDir: string, symbolFile: string, sysctl = false) {
    const command = [this.getPathToBin(), "build-kernel", srcDir, outDir, symbolFile];
    if (sysctl) {
      command.push("--sysctl");
    }
    return await this.runInDevelopmentEnv(command);
  }
  /**
   * Compares two snapshots.
   *
   * @param oldSnapDir Path to old snapshot.
   * @param newSnapDir Path to new snapshot.
   * @param outDir Path to directory where will be saved output of comparison.
   * @param options Array of options to pass to compared command.
   * @returns Promise that contains stdout of the compare command and statistics.
   */
  async compare(oldSnapDir: string, newSnapDir: string, outDir: string, options?: string[]) {
    const command = [
      this.getPathToBin(),
      "compare",
      "--report-stat",
      "--extended-stat",
      oldSnapDir,
      newSnapDir,
      "-o",
      outDir,
    ];
    if (options) {
      command.push(...options);
    }
    const output = await this.runInDevelopmentEnv(command);
    return {
      output,
      statistics: DiffKemp.getComparisonStatistics(output),
    };
  }

  /**
   * Returns statistics about comparison.
   *
   * @param comparisonOutput Standard output of comparison.
   */
  static getComparisonStatistics(comparisonOutput: string): ComparisonStatistics {
    return {
      runtime: Number(/^Elapsed time: *(\d+.?\d*) s$/m.exec(comparisonOutput)![1]),
      equal: Number(/^Equal:.*?(\d+).*\(\d+%\)$/m.exec(comparisonOutput)![1]),
      notEqual: Number(/^Not equal:.*?(\d+).*\(\d+%\)$/m.exec(comparisonOutput)![1]),
      unknown: Number(/^Unknown:.*?(\d+).*\(\d+%\)$/m.exec(comparisonOutput)![1]),
      errors: Number(/^Errors:.*?(\d+).*\(\d+%\)$/m.exec(comparisonOutput)![1]),
      totalDifferences: Number(/^Total differences:.*?(\d+).*$/m.exec(comparisonOutput)![1]),
    };
  }

  /**
   * Extracts differing functions from output directory of DiffKemp compare command.
   *
   * @returns Promise containing map, where keys are names of compared functions which were
   *   evaluated as non-equal and values list of differing functions for the given compared
   *   function. The compared functions are inserted to the map in sorted order, also the array with
   *   differing functions is sorted.
   */
  async getDiffering(outDir: string): Promise<Differences> {
    try {
      return Differences.fromContainer(this.container, outDir);
    } catch (error) {
      throw new Error(`Error while getting differing (${outDir}) in ${this.branch}`, {
        cause: error,
      });
    }
  }
}

/** Statistics about comparison. */
export interface ComparisonStatistics {
  /** Runtime of comparison in seconds. */
  runtime: number;
  /** Number of compared symbols evaluated as equal. */
  equal: number;
  /** Number of compared symbols evaluated as non-equal */
  notEqual: number;
  /** Number of compared symbols (usually located only in one snapshot). */
  unknown: number;
  /** Number of compared symbols where error occurred. */
  errors: number;
  /** Number of total differences found. */
  totalDifferences: number;
}
