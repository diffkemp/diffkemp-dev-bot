/**
 * Class allowing to evaluate multiple previous PRs identified by a PR number.
 *
 * @author Lukas Petr
 */
import { EvaluationConfig } from "./evaluation/config.js";
import { pino } from "pino";
import { Evaluation } from "./evaluation/evaluation.js";
import { mkdir, writeFile, appendFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { Cache } from "./evaluation/cache.js";
import { ProbotOctokit } from "probot";
import { Command } from "commander";
import { parse } from "yaml";

/** Specification what PR should be analysed and how. */
type PrConfigs = PrConfig[];
type PrConfig =
  | {
      id: number;
      prCmpOpt?: string[];
    }
  | number;

/** Class for analysing past PRs. */
class PastPrAnalysis {
  private octokit = new ProbotOctokit();
  /** @param resultsDirectory Directory where will be saved results. */
  constructor(private resultsDirectory: string) {}
  /**
   * Runs experiments on multiple PRs.
   *
   * @param prs Array of prs to compare. The array can either contain a PR number or PrSpecification
   *   object specifying in more detail how the PR should be analyzed.
   */
  public async comparePRs(prs: PrConfigs) {
    if (existsSync(this.resultsDirectory)) {
      throw new Error("Error: The result directory exists!");
    }
    await mkdir(this.resultsDirectory);
    for (const pr of prs) {
      await this.comparePR(pr);
    }
  }
  /**
   * Compares given PR using experiments against the past base branch. Logs to stdout if the results
   * are different and saves detailed results to resultsDirectory.
   *
   * @param prNumber Number of PR to compare or PrSpecification.
   */
  private async comparePR(pr: PrConfig) {
    let prNumber: number;
    let prCmpOpt: string[] | undefined = undefined;
    if (typeof pr === "object") {
      ({ id: prNumber, prCmpOpt } = pr);
    } else {
      prNumber = pr;
    }
    const { data } = await this.octokit.rest.pulls.get({
      owner: "diffkemp",
      repo: "diffkemp",
      pull_number: prNumber,
    });
    if (!data.head.repo || !data.base.repo) {
      throw new Error("Error: head.repo or base.repo is null");
    }
    const prRepo = data.head.repo.full_name;
    const prBranch = data.head.sha;
    const baseRepo = data.base.repo.full_name;
    const baseBranch = data.base.sha;

    const config = new EvaluationConfig({
      prRepo,
      prBranch,
      baseRepo,
      baseBranch,
      logger: pino({ level: "silent" }),
      baseSHA: baseBranch,
      prSHA: prBranch,
      options: {
        rebuild: true,
        run: ["eqbench", "rhel-functions", "rhel-sysctl"],
        prCmpOpt,
      },
      cacheBaseResults: true,
      cacheBaseSnapshots: true,
      cachePrSnapshots: true,
      cachePrResults: true,
      forceCaching: true,
    });
    const evaluation = new Evaluation(config);
    const logPath = join(this.resultsDirectory, prNumber.toString() + ".md");
    await writeFile(
      logPath,
      `# PR ${prNumber}

- **base:** ${baseRepo}/${baseBranch}
- **pr:** ${prRepo}/${prBranch}
`,
      { encoding: "utf8" },
    );
    const results = await evaluation.run();

    const comment = `PR ${prNumber} (${baseBranch}, ${prBranch}) provides `;
    let noDifferences = true;
    if (results.hasDifferences()) {
      noDifferences = false;
      console.log(comment + "different results");
    } else {
      console.log(comment + "same results");
    }
    await appendFile(
      logPath,
      `- **verdict**: ${noDifferences ? "same results" : "different results"} \n\n`,
    );
    await appendFile(logPath, results.report(), { encoding: "utf8" });
    if (results.hasFailed()) {
      console.log(`\tError: ${results.getFailedTitles().join(", ")}`);
      await appendFile(logPath, "\n## Errors: \n", { encoding: "utf8" });
      for (const error of results.getFailedErrors()) {
        if (error instanceof Error) {
          await this.saveErrors(error, logPath);
        }
      }
    }
  }

  private async saveErrors(error: Error, logPath: string) {
    const out = error.message + error.stack + "\n";
    await appendFile(logPath, out, {
      encoding: "utf8",
    });
    if (error?.cause && error.cause instanceof Error) {
      await this.saveErrors(error.cause, logPath);
    }
  }
}
/** Command line options of this program. */
interface ProgramOptions {
  outputDir: string;
  configFile: string;
  cacheDir?: string;
}

async function main() {
  const parser = new Command()
    .name("past-prs")
    .description("Evaluator of past pull requests")
    .requiredOption(
      "-o, --output-dir <OUTPUT_DIR>",
      "output directory for saving reports on analysis",
      "past-pr-logs-" + new Date().toISOString(),
    )
    .requiredOption(
      "-c, --config-file <CONFIG_FILE>",
      "path to configuration file specifying which PRs to compare",
      "past-prs-example.yml",
    )
    .option(
      "--cache-dir <CACHE_DIR>",
      "path where to cache snapshots and results and from which retrieve them",
    )
    .showHelpAfterError();
  parser.parse();
  const args: ProgramOptions = parser.opts();
  const prs = parse(await readFile(args.configFile, { encoding: "utf8" })) as PrConfigs;
  if (args.cacheDir) {
    Cache.CACHE_DIR = args.cacheDir;
  }
  Cache.cacheOnlyLastSnapshot = false;
  await new PastPrAnalysis(args.outputDir).comparePRs(prs);
}
void main();
