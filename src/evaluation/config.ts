/**
 * Configuration for running PR evaluations.
 *
 * @author Lukas Petr
 */

import { Context, Logger } from "probot";
import {
  getDefaultBranchSHA,
  getInstallationToken,
  getPRRepoAndBranch,
} from "../utils/comments.js";
import { parse } from "shell-quote";
import { Command, Option } from "commander";

/**
 * Text in a comment on a PR which launches evaluation of the PR.
 *
 * @note Comment must contain line starting with `\evaluate` and optionally can contain options on the rest of the line.
 */
export const EVALUATION_REGEX = /^\\evaluate\b(.*)$/m;

/** Class containing necessary configuration for running evaluation. */
export class EvaluationConfig {
  /** Class for logging. */
  logger;
  /** Owner and repository name from which the PR was made. */
  prRepo;
  /** Branch containing commits which are in the PR. */
  prBranch;

  /** App installation token for base repository, necessary for cloning private repos. */
  token?;
  /** Owner and repository on which the PR was opened. */
  baseRepo;
  /** Default branch of base repository. */
  baseBranch;
  /** Options for running evaluation provided by user. */
  options;
  /** SHA of last commit in the default branch of base repository. */
  baseSHA;

  constructor(params: EvaluationConfigParams) {
    this.prRepo = params.prRepo;
    this.prBranch = params.prBranch;
    this.baseRepo = params.baseRepo;
    this.baseBranch = params.baseBranch;
    this.token = params.token;
    this.options = params.options;
    this.logger = params.logger;
    this.baseSHA = params.baseSHA;
  }
  /**
   * Creates config based on the issue comment context.
   *
   * @returns Promise with configuration.
   */
  static async fromIssueComment(context: Context<"issue_comment">) {
    const { repo: prRepo, branch: prBranch } = await getPRRepoAndBranch(context);
    const {
      private: isPrivate,
      full_name: baseRepo,
      default_branch: baseBranch,
    } = context.payload.repository;
    // If the repository is private we need to get token, so we can clone the repo.
    const token = isPrivate ? await getInstallationToken(context) : undefined;
    const options = new EvaluationCommandParser().parse(context.payload.comment.body);
    const logger = context.log;
    const baseSHA = await getDefaultBranchSHA(context);
    return new EvaluationConfig({
      prBranch,
      prRepo,
      baseBranch,
      baseRepo,
      token,
      options,
      logger,
      baseSHA,
    });
  }
  /**
   * Creates config based on the push context, expects push to base branch.
   *
   * @returns Promise with configuration.
   */
  static async fromPushToMaster(context: Context<"push">) {
    const {
      private: isPrivate,
      full_name: baseRepo,
      default_branch: baseBranch,
    } = context.payload.repository;
    // If the repository is private we need to get token, so we can clone the repo.
    const token = isPrivate ? await getInstallationToken(context) : undefined;
    const logger = context.log;
    const baseSHA = await getDefaultBranchSHA(context);
    return new EvaluationConfig({
      baseBranch,
      baseRepo,
      token,
      logger,
      baseSHA,
    });
  }
  /** Returns true if all experiments should be run. */
  public runAllExperiments() {
    if (!this.options?.run) return true;
    else {
      const allExperiments: Experiments[] = ["eqbench", "rhel-functions", "rhel-sysctl"];
      return allExperiments.every((exp) => this.options?.run?.includes(exp));
    }
  }
  /** Returns true if config contains additional options for base branch. */
  public containsOptionsForBase() {
    return this.options?.cmpOpt && this.options?.cmpOpt.length > 0;
  }
  /** Returns true if it should be tried to restore results for base branch. */
  public restoreBaseResults() {
    // Recover results only if additional compare options are not supplied.
    return !this.containsOptionsForBase();
  }
  /** Returns true if results of the experiments on the base branch should be cached. */
  public cacheBaseResults() {
    return !this.containsOptionsForBase() && this.runAllExperiments();
  }
  /** Returns true if snapshots of the experiments on the base branch should be cached. */
  public cacheBaseSnapshots() {
    return this.runAllExperiments();
  }
}
interface EvaluationConfigParams {
  prRepo?: string;
  prBranch?: string;
  baseRepo: string;
  baseBranch: string;
  token?: string;
  options?: EvaluationOptions;
  logger: Logger;
  baseSHA: string;
}

/** Type representing options provided by user for running evaluation. */
interface EvaluationOptions {
  /** Comparison options to use by PR's DiffKemp. */
  prCmpOpt?: string[];
  /** Comparison options to use both by PR's and base DiffKemp. */
  cmpOpt?: string[];
  /** Rebuild snapshots on PR, respectively do not recover snapshots from cache. */
  rebuild?: boolean;
  /** Experiments to be run */
  run?: Experiments[];
}
/** List of possible experiments. */
type Experiments = "eqbench" | "rhel-sysctl" | "rhel-functions";

/** Error thrown when error occurs while parsing user options. */
export class CommandParserError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Class for parsing options provided by user on evaluate command. */
class EvaluationCommandParser {
  output = "";
  parser;
  constructor() {
    this.parser = new Command();
    this.parser
      .name("\\evaluate")
      .description("Evaluator of pull requests")
      .addOption(
        new Option("--run <experiments...>", "selection of experiments to be run").choices([
          "eqbench",
          "rhel-sysctl",
          "rhel-functions",
        ]),
      )
      .option("--pr-cmp-opt <options...>", "option to add options for PR's `compare` command")
      .option("--cmp-opt <options...>", "option to add options for `compare` command")
      .option("--rebuild", "rebuild snapshots for comparisons on PR")
      .showHelpAfterError()
      // Saving output to variable instead of printing.
      .configureOutput({
        writeOut: (str) => (this.output += str),
        writeErr: (str) => (this.output += str),
        outputError: (str) => (this.output += str),
      })
      // Do not exit application on exit!
      .exitOverride();
  }
  /** Parses options from comment. */
  parse(comment: string) {
    // Get arguments of evaluation
    let optionsStr = EVALUATION_REGEX.exec(comment)![1];
    if (!optionsStr) {
      optionsStr = "";
    } else {
      optionsStr = optionsStr.trim();
    }
    // Using shell-quote parser to split string into array of options.
    const optionsArr = parse(optionsStr);
    // The array can contain special values (e.g. if user used '||', '&&', ...
    // Check if the array does not include these, if yes throw error.
    optionsArr.forEach((option) => {
      if (typeof option !== "string") {
        throw new CommandParserError("Error occurred while processing evaluation options.");
      }
    });
    try {
      this.parser.parse(optionsArr as string[], { from: "user" });
      return this.parser.opts();
    } catch {
      throw new CommandParserError(this.output);
    }
  }
}
