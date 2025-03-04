/**
 * Contains classes for executing DiffKemp on version of RHEL kernel,
 *
 * @author Lukas Petr
 */

import { join } from "path";
import { DiffKemp } from "../../diffkemp.js";
import { ExperimentRunnerOptions, FailedExperiment } from "./experiment.js";
import { DefaultResult, DefaultResults } from "./default.js";
import { ExperimentTitle } from "./titles.js";

/** Supported versions for comparison. */
type RHELSupportedVersionCmp = "8.0-8.1" | "8.1-8.2" | "8.2-8.3" | "8.3-8.4" | "8.4-8.5";
/** Configuration of RHEL runner. */
interface RHELConfig {
  /** Run sysctl comparison or functions. */
  sysctl: boolean;
  /** List of versions to compare. */
  versions: RHELSupportedVersionCmp[];
  /** List of symbols to compare (for testing purposes). */
  symbolList?: string[];
}
const DEFAULT_RHELConfig: RHELConfig = {
  sysctl: false,
  versions: ["8.0-8.1", "8.1-8.2", "8.2-8.3", "8.3-8.4", "8.4-8.5"],
};

/** Class for executing DiffKemp on RHEL kernel. */
export class RHELRunner {
  static readonly SOURCES_PATH = "/experiments/sources/kernel";
  static readonly SNAPSHOTS_PATH = "/experiments/snapshots/kernel";
  static readonly RESULTS_PATH = "/experiments/results/kernel";
  /** List of symbols for comparison of sysctl options. */
  static readonly SYSCTL_LIST = ["kernel.*", "vm.*"];
  /** Maps RHEL version to kernel version. */
  static readonly VERSIONS_MAP = new Map([
    ["8.0", "4.18.0-80.el8"],
    ["8.1", "4.18.0-147.el8"],
    ["8.2", "4.18.0-193.el8"],
    ["8.3", "4.18.0-240.el8"],
    ["8.4", "4.18.0-305.el8"],
    ["8.5", "4.18.0-348.el8"],
  ]);
  private diffkemp;
  /** Path to where are save sources. */
  private sources_path;
  /** Path to where save snapshots. */
  private snapshots_path;
  /** Path to where save results of comparison. */
  private results_path;
  /** If necessary, path to file containing symbols which should be compared. */
  private symbolListPath?: string;
  /** Configuration of the runner. */
  private config: RHELConfig;
  /**
   * Prepares for running RHEL kernels comparison.
   *
   * @param sysctl True if compare sysctl options instead of KABI functions.
   */
  constructor(diffkemp: DiffKemp, config: Partial<RHELConfig> = DEFAULT_RHELConfig) {
    this.config = { ...DEFAULT_RHELConfig, ...config };
    this.diffkemp = diffkemp;
    this.sources_path = join(RHELRunner.SOURCES_PATH, this.config.sysctl ? "sysctl" : "functions");
    this.snapshots_path = join(
      RHELRunner.SNAPSHOTS_PATH,
      this.config.sysctl ? "sysctl" : "functions",
    );
    this.results_path = join(RHELRunner.RESULTS_PATH, this.config.sysctl ? "sysctl" : "functions");
  }

  /**
   * Executes DiffKemp on EqBench benchmarks.
   *
   * @returns Promise that resolves with list of results of comparison.
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
  public getTitle(): ExperimentTitle {
    return this.config.sysctl ? ExperimentTitle.RHEL_SYSCTL : ExperimentTitle.RHEL_FUNCTIONS;
  }
  private async runExperiment(options: ExperimentRunnerOptions) {
    await this.diffkemp.container.run(`mkdir -p ${this.results_path}`);
    await this.createSymbolListFile();
    await this.buildVersions();
    return await this.compareVersions(options.cmpOpts ?? []);
  }
  /**
   * Build snapshots for kernels specified in `config.versions`. If the snapshots exists, it does
   * not creates them.
   */
  private async buildVersions() {
    await this.diffkemp.container.run(`mkdir -p ${this.snapshots_path}`);
    // Build all version to snapshots
    const buildPromises: Promise<string>[] = [];
    const versions = this.getVersionsToBuild();
    for (const version of versions) {
      const name = RHELRunner.VERSIONS_MAP.get(version);
      const currentSourcePath = join(this.sources_path, `linux-${name}`);
      const currentSnapshotPath = join(this.snapshots_path, `linux-${name}`);
      if (await this.diffkemp.container.exists(currentSnapshotPath)) {
        // Snapshot exists do not create it .
        continue;
      }
      const symbolListPath = this.getPathToSymbolList(currentSourcePath);
      const promise = this.diffkemp.buildKernel(
        currentSourcePath,
        currentSnapshotPath,
        symbolListPath,
        this.config.sysctl,
      );
      buildPromises.push(promise);
    }
    await Promise.all(buildPromises);
  }
  /**
   * Compares all versions of RHEL kernel specified by `VERSIONS` attribute.
   *
   * @param options Additional options to be used for compare command.
   * @returns Promise containing list of results of comparison of RHEL kernel versions pairs.
   */
  private async compareVersions(options: string[]) {
    // The same snapshot versions cannot be compared at the same in parallel because data race
    // could occur. Splitting the versions to two groups, which will run in sequence.
    const firstVersions: RHELSupportedVersionCmp[] = [];
    const secondVersions: RHELSupportedVersionCmp[] = [];
    const firstGroupSnaps = new Set<string>();
    this.config.versions.forEach((oldNewVersion) => {
      const [oldVersion, newVersion] = oldNewVersion.split("-");
      if (firstGroupSnaps.has(oldVersion) || firstGroupSnaps.has(newVersion)) {
        secondVersions.push(oldNewVersion);
      } else {
        firstGroupSnaps.add(oldVersion);
        firstGroupSnaps.add(newVersion);
        firstVersions.push(oldNewVersion);
      }
    });
    const results = [
      ...(await this.compareInParallel(firstVersions, options)),
      ...(await this.compareInParallel(secondVersions, options)),
    ];
    // Sorting results by compared versions
    results.sort((r1, r2) => r1.description.localeCompare(r2.description));
    return new DefaultResults(this.getTitle(), results);
  }
  /**
   * Compares multiple versions in parallel.
   *
   * @param versions Versions to compare in parallel.
   * @param options Additional options to be used for compare command.
   */
  private async compareInParallel(
    versions: RHELSupportedVersionCmp[],
    options: string[],
  ): Promise<DefaultResult[]> {
    const resultPromises = new Array<Promise<DefaultResult>>();
    // Add user specified compare options
    versions.forEach((oldNewVersion) => {
      const [oldVersion, newVersion] = oldNewVersion.split("-");
      const promise = this.compare(oldVersion, newVersion, options);
      resultPromises.push(promise);
    });
    const results = await Promise.all(resultPromises);
    return results;
  }
  /**
   * Compares two versions of RHEL kernel and returns result.
   *
   * @param oldVersion Version in format 8.X
   * @param options Additional options to be used for compare command.
   */
  private async compare(oldVersion: string, newVersion: string, options?: string[]) {
    const outputDir = join(this.results_path, `linux-${oldVersion}-${newVersion}`);
    const oldSnapshotPath = join(
      this.snapshots_path,
      `linux-${RHELRunner.VERSIONS_MAP.get(oldVersion)}`,
    );
    const newSnapshotPath = join(
      this.snapshots_path,
      `linux-${RHELRunner.VERSIONS_MAP.get(newVersion)}`,
    );
    const { statistics } = await this.diffkemp.compare(
      oldSnapshotPath,
      newSnapshotPath,
      outputDir,
      options,
    );
    return new DefaultResult(
      `${oldVersion}-${newVersion}`,
      statistics,
      await this.diffkemp.getDiffering(outputDir),
    );
  }

  /** Get list of RHEL versions to build. */
  private getVersionsToBuild(): string[] {
    const versions = new Set<string>();
    this.config.versions.forEach((v) => {
      const [oldVersion, newVersion] = v.split("-");
      versions.add(oldVersion);
      versions.add(newVersion);
    });
    return [...versions.values()];
  }

  /** If necessary creates file with symbols which should be build and compared. */
  private async createSymbolListFile() {
    if (this.config.symbolList || this.config.sysctl) {
      let symbols: string[];
      if (this.config.symbolList) {
        symbols = this.config.symbolList;
      } else {
        symbols = RHELRunner.SYSCTL_LIST;
      }
      const tmpDirPath = await this.diffkemp.container.mkdtemp();
      this.symbolListPath = join(tmpDirPath, "symbol_list");
      await this.diffkemp.container.run(
        `echo -e '${symbols.join("\n")}' >> ${this.symbolListPath}`,
      );
    }
  }

  /**
   * Returns path to symbol list file.
   *
   * @param sourcePath Path to directory containing sources of a compared RHEL version.
   */
  private getPathToSymbolList(sourcePath: string) {
    return this.symbolListPath ?? join(sourcePath, "kabi_whitelist_x86_64");
  }
}
