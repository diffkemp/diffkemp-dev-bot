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
import { Command } from "commander";

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
}
interface EvaluationConfigParams {
  prRepo: string;
  prBranch: string;
  baseRepo: string;
  baseBranch: string;
  token?: string;
  options: EvaluationOptions;
  logger: Logger;
  baseSHA: string;
}

/** Type representing options provided by user for running evaluation. */
interface EvaluationOptions {
  /** Comparison options to use by PR's DiffKemp. */
  prCmpOpt?: string[];
}

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
      .option("--pr-cmp-opt <options...>", "option to add options for PR's `compare` command")
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
